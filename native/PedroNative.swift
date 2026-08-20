import Foundation
import UIKit
import Capacitor
import Speech
import AVFoundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Native bridge for Pedro.
///
/// Two things the web app can't do on its own:
///   1. `ask`      - answers using the language model built into the iPhone, with no
///                   internet at all.
///   2. `listen`   - Apple's real speech recogniser, which Safari refuses web pages.
///
/// Everything degrades politely: if the on-device model isn't there, `available`
/// reports why, and the web app falls back to Gemini.
@objc(PedroNative)
public class PedroNative: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PedroNative"
    public let jsName = "PedroNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ask",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackground",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openURL",        returnType: CAPPluginReturnPromise)
    ]

    // MARK: - on-device model

    /// Can this phone answer without the internet, and if not, why not?
    @objc func available(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["available": true, "reason": ""])
            case .unavailable(let reason):
                call.resolve(["available": false, "reason": describe(reason)])
            @unknown default:
                call.resolve(["available": false, "reason": "unknown state"])
            }
            return
        }
        call.resolve(["available": false, "reason": "needs iOS 26 or later"])
        #else
        call.resolve(["available": false, "reason": "this build has no on-device model support"])
        #endif
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func describe(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible:      return "this iPhone can't run the on-device model"
        case .appleIntelligenceNotEnabled:
            return "Apple Intelligence is off - turn it on in Settings"
        case .modelNotReady:          return "the model is still downloading - try again shortly"
        @unknown default:             return "unavailable"
        }
    }
    #endif

    /// Answer a question entirely on the device.
    @objc func ask(_ call: CAPPluginCall) {
        let prompt = call.getString("prompt") ?? ""
        let instructions = call.getString("system") ?? "You are Pedro, a helpful personal assistant. Answer briefly."
        if prompt.isEmpty { call.reject("no prompt"); return }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = LanguageModelSession(instructions: instructions)
                    let result = try await session.respond(to: prompt)
                    call.resolve(["reply": result.content])
                } catch {
                    call.reject("on-device model failed: \(error.localizedDescription)")
                }
            }
            return
        }
        call.reject("needs iOS 26 or later")
        #else
        call.reject("this build has no on-device model support")
        #endif
    }

    // MARK: - speech recognition

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()

    /// Start listening. Partial results are pushed to JS as `pedroSpeech` events.
    @objc func startListening(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard let self = self else { return }
            guard status == .authorized else {
                call.reject("speech recognition not allowed")
                return
            }
            self.requestMic { granted in
                guard granted else { call.reject("microphone not allowed"); return }
                DispatchQueue.main.async { self.beginListening(call) }
            }
        }
    }

    /// Asking for the microphone changed in iOS 17: it used to hang off the
    /// audio session, now it has its own class. Ask the way this device knows.
    private func requestMic(_ done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in done(granted) }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in done(granted) }
        }
    }

    /// Hold the audio session open so listening survives leaving the app.
    /// Without the audio background mode in Info.plist iOS suspends us anyway,
    /// so this is only half the story - the build adds the other half.
    private var keepAlive = false

    /// Hand a URL to iOS so it opens whatever app owns that scheme - maps,
    /// music, a phone number, or one of their own Shortcuts. iOS decides what
    /// happens next, and anything that sends still needs a tap in that app.
    @objc func openURL(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("that is not a URL")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(url) else {
                call.reject("nothing on this phone opens that")
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve(["opened": true]) }
                else { call.reject("iOS would not open it") }
            }
        }
    }

    @objc func setBackground(_ call: CAPPluginCall) {
        let on = call.getBool("enabled") ?? false
        keepAlive = on
        do {
            let session = AVAudioSession.sharedInstance()
            if on {
                try session.setCategory(.playAndRecord, mode: .spokenAudio,
                                        options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
                try session.setActive(true, options: .notifyOthersOnDeactivation)
            }
            call.resolve(["enabled": on])
        } catch {
            call.reject("couldn't hold the audio session: (error.localizedDescription)")
        }
    }

    private func beginListening(_ call: CAPPluginCall) {
        stopEverything()

        recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.reject("speech recogniser unavailable for this language")
            return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // keeps it working with no internet, and keeps audio on the device
        if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req

        do {
            let session = AVAudioSession.sharedInstance()
            // .measurement turns off output processing, which leaves anything he
            // says almost inaudible while the microphone is up - this still
            // recognises speech well and lets him be heard afterwards
            try session.setCategory(.playAndRecord, mode: .spokenAudio,
                                    options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let node = engine.inputNode
            node.removeTap(onBus: 0)
            node.installTap(onBus: 0, bufferSize: 1024, format: node.outputFormat(forBus: 0)) { buffer, _ in
                req.append(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            call.reject("couldn't start the microphone: \(error.localizedDescription)")
            return
        }

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("pedroSpeech", data: [
                    "text": result.bestTranscription.formattedString,
                    "final": result.isFinal
                ])
                if result.isFinal { self.stopEverything() }
            }
            if error != nil {
                self.notifyListeners("pedroSpeechEnd", data: ["error": error!.localizedDescription])
                self.stopEverything()
            }
        }

        call.resolve(["listening": true])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        stopEverything()
        call.resolve(["listening": false])
    }

    private func stopEverything() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        if !keepAlive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
