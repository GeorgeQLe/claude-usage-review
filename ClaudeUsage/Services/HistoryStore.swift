import Foundation

class HistoryStore {
    private var cache: [UUID: [UsageSnapshot]] = [:]
    private let fileManager = FileManager.default

    private var baseDirectory: URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("ClaudeUsage")
    }

    private func fileURL(for accountId: UUID) -> URL {
        baseDirectory.appendingPathComponent("history-\(accountId.uuidString).json")
    }

    // MARK: - Public API

    func append(_ snapshot: UsageSnapshot, for accountId: UUID) {
        var snapshots = loadFromDisk(for: accountId)
        snapshots.append(snapshot)
        snapshots = compact(snapshots)
        cache[accountId] = snapshots
        writeToDisk(snapshots, for: accountId)
    }

    func snapshots(for accountId: UUID, lastHours: Int) -> [UsageSnapshot] {
        let all = cache[accountId] ?? loadFromDisk(for: accountId)
        let cutoff = Date().addingTimeInterval(-Double(lastHours) * 3600)
        return all.filter { $0.timestamp >= cutoff }
    }

    // MARK: - Persistence

    private func loadFromDisk(for accountId: UUID) -> [UsageSnapshot] {
        if let cached = cache[accountId] {
            return cached
        }
        let url = fileURL(for: accountId)
        guard let data = try? Data(contentsOf: url) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        let snapshots = (try? decoder.decode([UsageSnapshot].self, from: data)) ?? []
        cache[accountId] = snapshots
        return snapshots
    }

    private func writeToDisk(_ snapshots: [UsageSnapshot], for accountId: UUID) {
        try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        guard let data = try? encoder.encode(snapshots) else { return }
        try? data.write(to: fileURL(for: accountId), options: .atomic)
    }

    // MARK: - Compaction

    func compact(_ snapshots: [UsageSnapshot]) -> [UsageSnapshot] {
        let now = Date()
        let oneDayAgo = now.addingTimeInterval(-24 * 3600)
        let sevenDaysAgo = now.addingTimeInterval(-7 * 24 * 3600)

        // Split into buckets
        var recent: [UsageSnapshot] = []      // < 24h — keep all
        var midRange: [UsageSnapshot] = []    // 24h–7d — downsample to 1/hour (keep max)
        // > 7d — drop

        for s in snapshots {
            if s.timestamp >= oneDayAgo {
                recent.append(s)
            } else if s.timestamp >= sevenDaysAgo {
                midRange.append(s)
            }
            // else: older than 7d, discard
        }

        // Downsample mid-range: group by hour, keep the one with highest session utilization
        let calendar = Calendar.current
        var hourBuckets: [DateComponents: UsageSnapshot] = [:]
        for s in midRange {
            let comps = calendar.dateComponents([.year, .month, .day, .hour], from: s.timestamp)
            if let existing = hourBuckets[comps] {
                if s.sessionUtilization > existing.sessionUtilization {
                    hourBuckets[comps] = s
                }
            } else {
                hourBuckets[comps] = s
            }
        }

        var result = Array(hourBuckets.values)
        result.append(contentsOf: recent)
        result.sort { $0.timestamp < $1.timestamp }
        return result
    }
}
