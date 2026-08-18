import SwiftUI

@main
struct AppleIpTvApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task {
                    store.load()
                    await store.syncAll()
                }
        }
    }
}
