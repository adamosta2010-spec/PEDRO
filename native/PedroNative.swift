import Foundation
import UIKit
import Capacitor
import Speech
import AVFoundation
import Vision

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
public class PedroNative: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {

    public let identifier = "PedroNative"
    public let jsName = "PedroNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ask",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackground",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openURL",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warm",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWords",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "analyse",        returnType: CAPPluginReturnPromise)
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
    /// The session was built from scratch for every question, and building it is
    /// the slow part. Keep it, and start again only if the instructions change.
    private var keptSession: Any?
    private var keptFor: String = ""

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func session(for instructions: String) -> LanguageModelSession {
        if keptFor == instructions, let s = keptSession as? LanguageModelSession {
            return s
        }
        let s = LanguageModelSession(instructions: instructions)
        s.prewarm()          // load it now rather than on the first question
        keptSession = s
        keptFor = instructions
        return s
    }
    #endif

    /// Load the model before it is needed, so the first question is not the slow one.
    @objc func warm(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let instructions = call.getString("system") ?? "You are a helpful assistant."
            _ = session(for: instructions)
            call.resolve(["warm": true])
            return
        }
        #endif
        call.resolve(["warm": false])
    }

    @objc func ask(_ call: CAPPluginCall) {
        let prompt = call.getString("prompt") ?? ""
        let instructions = call.getString("system") ?? "You are Pedro, a helpful personal assistant. Answer briefly."
        if prompt.isEmpty { call.reject("no prompt"); return }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let s = self.session(for: instructions)
                    let result = try await s.respond(to: prompt)
                    call.resolve(["reply": result.content])
                } catch {
                    // a session can be left in a bad state - start fresh next time
                    self.keptSession = nil
                    self.keptFor = ""
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

    /// Words the recogniser should expect. The web app sets these - his name,
    /// and whatever the person is called - because those are the ones that
    /// matter and the ones a general model is most likely to get wrong.
    private var wakeWords: [String] = ["Pedro"]

    @objc func setWords(_ call: CAPPluginCall) {
        let words = call.getArray("words", String.self) ?? []
        wakeWords = words.isEmpty ? ["Pedro"] : words
        call.resolve(["words": wakeWords])
    }

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
    /// listening is meant to be happening, as opposed to merely running now
    private var wantListening = false

    /// Hand a URL to iOS so it opens whatever app owns that scheme - maps,
    /// music, a phone number, or one of their own Shortcuts. iOS decides what
    /// happens next, and anything that sends still needs a tap in that app.
    // MARK: - looking, without the network

    /// What the phone itself can see: what it thinks the thing is, any words
    /// in it, and how many faces. No key, no signal, nothing leaves the device.
    /// The language model cannot look at pictures - this can.
    @objc func analyse(_ call: CAPPluginCall) {
        guard let b64 = call.getString("image"),
              let data = Data(base64Encoded: b64),
              let image = UIImage(data: data),
              let cg = image.cgImage else {
            call.reject("that is not a picture")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let handler = VNImageRequestHandler(cgImage: cg, options: [:])
            var labels: [String] = []
            var words: [String] = []

            let classify = VNClassifyImageRequest()
            let text = VNRecognizeTextRequest()
            text.recognitionLevel = .accurate
            text.usesLanguageCorrection = true
            let faceReq = VNDetectFaceRectanglesRequest()

            do {
                try handler.perform([classify, text, faceReq])
            } catch {
                DispatchQueue.main.async {
                    call.reject("could not look at that: \(error.localizedDescription)")
                }
                return
            }

            if let found = classify.results as? [VNClassificationObservation] {
                labels = found
                    .filter { $0.confidence > 0.12 }
                    .prefix(6)
                    .map { $0.identifier.replacingOccurrences(of: "_", with: " ") }
            }
            if let found = text.results as? [VNRecognizedTextObservation] {
                words = Array(found.compactMap { $0.topCandidates(1).first?.string }
                                   .filter { !$0.isEmpty }.prefix(20))
            }
            let faces = faceReq.results?.count ?? 0

            DispatchQueue.main.async {
                call.resolve(["labels": labels, "text": words, "faces": faces])
            }
        }
    }

    // MARK: - speaking

    /// The web view's own speech engine is suspended while the app is off
    /// screen, so anything he said queued up until the app was opened. Speaking
    /// here goes through the audio session that is already keeping us alive.
    private let synth = AVSpeechSynthesizer()
    private var synthWired = false

    /// Tell the web app the moment he stops talking, so it can start listening
    /// again straight away instead of guessing from the length of the sentence.
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        notifyListeners("pedroSpokeEnd", data: ["done": true])
    }
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        notifyListeners("pedroSpokeEnd", data: ["done": false])
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        if text.isEmpty { call.reject("nothing to say"); return }
        let rate = Float(call.getDouble("rate") ?? 1.0)
        let volume = Float(call.getDouble("volume") ?? 1.0)
        let voiceName = call.getString("voice") ?? ""

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if !self.synthWired { self.synth.delegate = self; self.synthWired = true }
            self.synth.stopSpeaking(at: .immediate)
            let u = AVSpeechUtterance(string: text)
            // the system default is about half of the scale, so scale around it
            u.rate = max(0.3, min(0.7, AVSpeechUtteranceDefaultSpeechRate * rate))
            u.volume = max(0, min(1, volume))
            u.pitchMultiplier = 1.0
            if !voiceName.isEmpty,
               let match = AVSpeechSynthesisVoice.speechVoices().first(where: { $0.name == voiceName }) {
                u.voice = match
            } else {
                let code = Locale.preferredLanguages.first ?? "en-US"
                // the enhanced voices sound like a person rather than a machine
                let best = AVSpeechSynthesisVoice.speechVoices().first(where: {
                    $0.language.hasPrefix(String(code.prefix(2))) && $0.quality != .default
                })
                u.voice = best ?? AVSpeechSynthesisVoice(language: code)
            }
            self.synth.speak(u)
            call.resolve(["speaking": true])
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.synth.stopSpeaking(at: .immediate)
            call.resolve(["speaking": false])
        }
    }

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
            call.reject("couldn't hold the audio session: \(error.localizedDescription)")
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
        req.taskHint = .dictation
        if #available(iOS 16.0, *) { req.addsPunctuation = true }
        req.contextualStrings = wakeWords
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
                if result.isFinal {
                    self.stopEverything()
                    self.resumeIfWanted()
                }
            }
            if error != nil {
                self.notifyListeners("pedroSpeechEnd", data: ["error": error!.localizedDescription])
                self.stopEverything()
                self.resumeIfWanted()
            }
        }

        wantListening = true
        call.resolve(["listening": true])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        wantListening = false
        stopEverything()
        call.resolve(["listening": false])
    }

    /// Apple ends a recognition task after a pause, or after about a minute of
    /// audio. While background listening is on, start another one - the web
    /// layer cannot be relied on to do it once the app is off screen.
    private func resumeIfWanted() {
        guard keepAlive, wantListening else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self = self, self.keepAlive, self.wantListening else { return }
            self.restartListening()
        }
    }

    /// beginListening, without a call waiting for an answer
    private func restartListening() {
        recognizer = recognizer ?? SFSpeechRecognizer(locale: Locale.current)
        guard let recognizer = recognizer, recognizer.isAvailable else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.taskHint = .dictation
        if #available(iOS 16.0, *) { req.addsPunctuation = true }
        req.contextualStrings = wakeWords
        if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req
        do {
            let node = engine.inputNode
            node.removeTap(onBus: 0)
            node.installTap(onBus: 0, bufferSize: 1024, format: node.outputFormat(forBus: 0)) { buffer, _ in
                req.append(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            notifyListeners("pedroSpeechEnd", data: ["error": error.localizedDescription])
            return
        }
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("pedroSpeech", data: [
                    "text": result.bestTranscription.formattedString,
                    "final": result.isFinal
                ])
                if result.isFinal {
                    self.stopEverything()
                    self.resumeIfWanted()
                }
            }
            if error != nil {
                self.stopEverything()
                self.resumeIfWanted()
            }
        }
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
