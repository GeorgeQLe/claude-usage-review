import Foundation

class GeminiWrapper {

    let ledger: GeminiEventLedger
    let geminiPath: String

    init(ledger: GeminiEventLedger, geminiPath: String? = nil) {
        if let path = geminiPath {
            self.geminiPath = path
        } else {
            self.geminiPath = GeminiWrapper.findGeminiPath() ?? "/usr/local/bin/gemini"
        }
        self.ledger = ledger
    }

    func launch(arguments: [String]) throws -> GeminiInvocationEvent {
        let startTime = Date()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: geminiPath)
        process.arguments = arguments

        let stderrPipe = Pipe()
        process.standardError = stderrPipe

        try process.run()
        process.waitUntilExit()

        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrOutput = String(data: stderrData, encoding: .utf8) ?? ""

        let endTime = Date()

        let limitHit = stderrOutput.contains("rate limit") || stderrOutput.contains("usage limit")
        let commandMode = arguments.first ?? "unknown"
        let model = extractModel(from: arguments)

        let event = GeminiInvocationEvent(
            startTime: startTime,
            endTime: endTime,
            commandMode: commandMode,
            model: model,
            limitHitDetected: limitHit
        )

        try ledger.append(event)
        return event
    }

    // MARK: - Private

    private func extractModel(from arguments: [String]) -> String {
        guard let idx = arguments.firstIndex(of: "--model"),
              idx + 1 < arguments.count else {
            return "default"
        }
        return arguments[idx + 1]
    }

    private static func findGeminiPath() -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["gemini"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }
}
