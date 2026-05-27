import AppKit
import WebKit

// macOS 原生壳：负责窗口生命周期、启动本地服务，以及把 Web 前端接到系统能力上。
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var serverProcess: Process?
    // 保存 open -W 进程引用，避免外部软件还没关闭时 Process 被释放。
    private var openProcesses: [Process] = []
    private var cursorIsHidden = false
    private let projectPath = "/Users/wangkeyu/Documents/我的世界"
    private let appURL = URL(string: "http://localhost:4173/")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 先启动 Node 本地服务，再创建 WebView 窗口，最后等服务可用后加载页面。
        startServer()
        createWindow()
        loadAppWhenReady()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // 退出前恢复系统鼠标，并关闭由桌面壳启动的本地服务。
        showCursorIfNeeded()
        serverProcess?.terminate()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // 前端通过 window.webkit.messageHandlers 发送消息到这里，实现 JS -> Native 桥接。
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
        // 桌面应用内置一个本地 Web 服务，用来提供静态页面和文件系统 API。
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
        // 优先使用 Codex 打包的 Node，其次回退到系统常见安装路径。
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
        // 注册前端可调用的原生能力：退出、鼠标显示隐藏、打开外部对象。
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
            // 延迟进入全屏，让窗口先完成创建和激活，减少启动时的闪烁。
            if !window.styleMask.contains(.fullScreen) {
                window.toggleFullScreen(nil)
            }
        }
    }

    private func loadAppWhenReady(attempt: Int = 0) {
        // Node 服务启动需要一点时间，这里轮询 localhost，成功后再加载 WebView。
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
        // -W 会等待外部应用退出；退出后 terminationHandler 把游戏窗口重新带回前台。
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
            // 用户关闭外部软件后，恢复到游戏窗口，保持“桌面入口”体验连续。
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
