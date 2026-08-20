import Foundation
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
        CAPPluginMethod(name: "stopListening",  returnType: CAPPluginReturnPromise)
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
            AVAudioApplication.requestRecordPermission { granted in
                guard granted else { call.reject("microphone not allowed"); return }
                DispatchQueue.main.async { self.beginListening(call) }
            }
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
            try session.setCategory(.playAndRecord, mode: .measurement,
                                    options: [.duckOthers, .defaultToSpeaker])
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
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
