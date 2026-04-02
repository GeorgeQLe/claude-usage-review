import AppKit
import Combine

class AppDelegate: NSObject, NSApplicationDelegate {
    weak var viewModel: UsageViewModel?
    private var tooltipCancellable: AnyCancellable?
    private var bindTimer: Timer?
    private var statusButton: NSStatusBarButton?
    private var tooltipWindow: NSWindow?
    private var trackingArea: NSTrackingArea?
    private var hoverMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        ProcessInfo.processInfo.disableAutomaticTermination("Menu bar app must stay running")
        startBinding()
    }

    private func startBinding() {
        guard tooltipCancellable == nil else { return }
        var attempts = 0
        bindTimer?.invalidate()
        bindTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            attempts += 1
            if let button = self.findStatusButton() {
                self.statusButton = button
                self.setupHoverTracking(button: button)
                self.subscribeToData()
                timer.invalidate()
            } else if attempts >= 10 {
                timer.invalidate()
            }
        }
        bindTimer?.fire()
    }

    private func findStatusButton() -> NSStatusBarButton? {
        for window in NSApp.windows {
            let className = String(describing: type(of: window))
            if className.contains("StatusBar") {
                if let button = findButtonInView(window.contentView) {
                    return button
                }
            }
        }
        return nil
    }

    private func findButtonInView(_ view: NSView?) -> NSStatusBarButton? {
        guard let view = view else { return nil }
        if let button = view as? NSStatusBarButton { return button }
        for subview in view.subviews {
            if let button = findButtonInView(subview) { return button }
        }
        return nil
    }

    private func setupHoverTracking(button: NSStatusBarButton) {
        // Use a global event monitor to detect mouse hover over the status item
        hoverMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .mouseEntered, .mouseExited]) { [weak self] event in
            guard let self = self, let button = self.statusButton, let window = button.window else { return }
            let mouseLocation = NSEvent.mouseLocation
            let buttonFrame = window.convertToScreen(button.convert(button.bounds, to: nil))

            if buttonFrame.contains(mouseLocation) {
                self.showTooltipWindow(near: buttonFrame)
            } else {
                self.hideTooltipWindow()
            }
        }
    }

    private func subscribeToData() {
        guard let viewModel = viewModel else { return }
        tooltipCancellable = viewModel.$usageData
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                // Update tooltip text if window is visible
                if let window = self?.tooltipWindow, window.isVisible {
                    self?.updateTooltipText()
                }
            }
    }

    private func showTooltipWindow(near buttonFrame: NSRect) {
        guard let tip = viewModel?.paceGuidance, !tip.isEmpty else { return }

        if tooltipWindow == nil {
            let window = NSWindow(contentRect: .zero, styleMask: [.borderless], backing: .buffered, defer: true)
            window.isOpaque = false
            window.backgroundColor = .clear
            window.level = .floating
            window.ignoresMouseEvents = true

            let field = NSTextField(labelWithString: "")
            field.font = NSFont.systemFont(ofSize: 11)
            field.textColor = .labelColor
            field.backgroundColor = NSColor(white: 0.15, alpha: 0.95)
            field.isBordered = false
            field.drawsBackground = true
            field.alignment = .center
            field.wantsLayer = true
            field.layer?.cornerRadius = 4

            let container = NSView()
            container.wantsLayer = true
            container.layer?.cornerRadius = 4
            container.layer?.backgroundColor = NSColor(white: 0.15, alpha: 0.95).cgColor
            container.addSubview(field)

            field.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                field.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
                field.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
                field.topAnchor.constraint(equalTo: container.topAnchor, constant: 4),
                field.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -4),
            ])

            window.contentView = container
            tooltipWindow = window
        }

        updateTooltipText()

        guard let window = tooltipWindow, let contentView = window.contentView else { return }
        let size = contentView.fittingSize
        let origin = NSPoint(
            x: buttonFrame.midX - size.width / 2,
            y: buttonFrame.minY - size.height - 4
        )
        window.setFrame(NSRect(origin: origin, size: size), display: true)

        if !window.isVisible {
            window.orderFront(nil)
        }
    }

    private func updateTooltipText() {
        guard let tip = viewModel?.paceGuidance,
              let container = tooltipWindow?.contentView,
              let field = container.subviews.first as? NSTextField else { return }
        field.stringValue = tip
    }

    private func hideTooltipWindow() {
        tooltipWindow?.orderOut(nil)
    }

    deinit {
        if let monitor = hoverMonitor {
            NSEvent.removeMonitor(monitor)
        }
        bindTimer?.invalidate()
    }
}
