import Foundation

class CodexWrapper {

    let ledger: CodexEventLedger
    let codexPath: String

    init(ledger: CodexEventLedger, codexPath: String? = nil) {
        if let path = codexPath {
            self.codexPath = path
        } else {
            self.codexPath = CodexWrapper.findCodexPath() ?? "/usr/local/bin/codex"
        }
        self.ledger = ledger
    }

    func launch(arguments: [String]) throws -> CodexInvocationEvent {
        let startTime = Date()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: codexPath)
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

        let event = CodexInvocationEvent(
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

    private static func findCodexPath() -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["codex"]

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
