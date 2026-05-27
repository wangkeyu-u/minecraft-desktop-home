import AppKit
import WebKit

// Hosts the local WebGL app inside a native macOS process and owns OS-level side effects.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var serverProcess: Process?
    // Strong references keep `open -W` processes alive until their termination handlers run.
    private var openProcesses: [Process] = []
    private var cursorIsHidden = false
    private let projectPath = "/Users/wangkeyu/Documents/我的世界"
    private let appURL = URL(string: "http://localhost:4173/")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // The WebView loads only after the local server is reachable to avoid a transient error page.
        startServer()
        createWindow()
        loadAppWhenReady()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Cursor visibility is process-global in AppKit, so restore it before shutdown.
        showCursorIfNeeded()
        serverProcess?.terminate()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Narrow JS -> native bridge: only expose actions that cannot be implemented safely in WebView.
        if message.name == "nativeQuit" {
            NSApp.terminate(nil)
        } else if message.name == "nativeOpen" {
            if let path = message.body as? String {
                openExternalTarget(path)
            }
        } else if message.name == "nativeCursor" {
            if let hidden = message.body as? Bool {
                hidden ? hideCursorIfNeeded() : showCursorIfNeeded()
            }
        }
    }

    private func hideCursorIfNeeded() {
        guard !cursorIsHidden else { return }
        NSCursor.hide()
        cursorIsHidden = true
    }

    private func showCursorIfNeeded() {
        guard cursorIsHidden else { return }
        NSCursor.unhide()
        cursorIsHidden = false
    }

    private func startServer() {
        // Keep filesystem access in the local Node service instead of granting it to WebView code.
        let process = Process()
        if let nodePath = resolveNodeExecutable() {
            process.executableURL = URL(fileURLWithPath: nodePath)
            process.arguments = ["server.js"]
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", "server.js"]
            process.environment = [
                "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            ]
        }
        process.currentDirectoryURL = URL(fileURLWithPath: projectPath)

        let output = Pipe()
        process.standardOutput = output
        process.standardError = output

        do {
            try process.run()
            serverProcess = process
        } catch {
            NSLog("Unable to start local server: \(error.localizedDescription)")
        }
    }

    private func resolveNodeExecutable() -> String? {
        // Development build fallback order; a production bundle should vendor a stable runtime.
        let candidates = [
            "/Users/wangkeyu/Desktop/Codex.app/Contents/Resources/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node"
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private func createWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        // Message names are part of the frontend/native contract; keep them stable across releases.
        configuration.userContentController.add(self, name: "nativeQuit")
        configuration.userContentController.add(self, name: "nativeCursor")
        configuration.userContentController.add(self, name: "nativeOpen")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        self.webView = webView

        let screenFrame = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let window = NSWindow(
            contentRect: screenFrame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "我的电脑之家"
        window.contentView = webView
        window.titlebarAppearsTransparent = true
        window.collectionBehavior = [.fullScreenPrimary, .fullScreenAllowsTiling]
        window.makeKeyAndOrderFront(nil)
        self.window = window

        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            // Enter fullscreen after activation so AppKit has a concrete window to transition.
            if !window.styleMask.contains(.fullScreen) {
                window.toggleFullScreen(nil)
            }
        }
    }

    private func loadAppWhenReady(attempt: Int = 0) {
        // Poll instead of sleeping for a fixed duration because Node startup varies by machine.
        URLSession.shared.dataTask(with: appURL) { [weak self] _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                guard let self else { return }
                if ok || attempt > 25 {
                    self.webView?.load(URLRequest(url: self.appURL))
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        self.loadAppWhenReady(attempt: attempt + 1)
                    }
                }
            }
        }.resume()
    }

    private func openExternalTarget(_ targetPath: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        // `-W` preserves launcher continuity: when the opened app exits, focus returns here.
        process.arguments = ["-W", targetPath]
        process.terminationHandler = { [weak self, weak process] _ in
            DispatchQueue.main.async {
                if let process {
                    self?.openProcesses.removeAll { $0 === process }
                }
                self?.bringGameToFront()
            }
        }

        do {
            try process.run()
            openProcesses.append(process)
        } catch {
            NSLog("Unable to open external target: \(error.localizedDescription)")
        }
    }

    private func bringGameToFront() {
        DispatchQueue.main.async { [weak self] in
            // Always restore cursor before reactivation; the Web layer may have hidden it for gameplay.
            self?.showCursorIfNeeded()
            self?.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
