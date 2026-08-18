import AVKit
import SwiftUI

/// Oynatilacak icerigin tanimi.
struct PlaybackItem: Identifiable, Equatable {
    var id: String { episodeId ?? itemId }
    var url: String
    var title: String
    var subtitle: String?
    var isLive: Bool
    var itemId: String
    var kind: MediaKind
    var episodeId: String?
    var poster: String?
    var startPositionSecs: Double?
}

/// AVPlayerViewController sarmalayicisi.
///
/// tvOS'un yerel oynaticisini kullanmak; uzaktan kumanda jestleri,
/// altyazi/ses secimi ve "Now Playing" ekrani gibi sistem ozelliklerinin
/// bedavaya gelmesini saglar.
struct PlayerView: UIViewControllerRepresentable {
    let item: PlaybackItem
    /// (konum, sure) - ilerleme kaydi icin duzenli olarak cagrilir.
    var onProgress: (Double, Double) -> Void
    var onFinished: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onProgress: onProgress, onFinished: onFinished)
    }

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.allowsPictureInPicturePlayback = true
        controller.videoGravity = .resizeAspect
        context.coordinator.attach(to: controller, item: item)
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        context.coordinator.attach(to: controller, item: item)
    }

    static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Coordinator) {
        coordinator.teardown()
    }

    final class Coordinator: NSObject {
        private var player: AVPlayer?
        private var timeObserver: Any?
        private var endObserver: NSObjectProtocol?
        private var currentURL: String?
        private let onProgress: (Double, Double) -> Void
        private let onFinished: () -> Void

        init(onProgress: @escaping (Double, Double) -> Void, onFinished: @escaping () -> Void) {
            self.onProgress = onProgress
            self.onFinished = onFinished
        }

        func attach(to controller: AVPlayerViewController, item: PlaybackItem) {
            guard currentURL != item.url, let url = URL(string: item.url) else { return }
            teardown()
            currentURL = item.url

            let asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "AppleIpTv/1.0 (tvOS)"]
            ])
            let playerItem = AVPlayerItem(asset: asset)
            let player = AVPlayer(playerItem: playerItem)
            player.automaticallyWaitsToMinimizeStalling = !item.isLive
            self.player = player
            controller.player = player

            // Bilgi cubugunda baslik goster.
            let titleItem = AVMutableMetadataItem()
            titleItem.identifier = .commonIdentifierTitle
            titleItem.value = item.title as NSString
            let subtitleItem = AVMutableMetadataItem()
            subtitleItem.identifier = .iTunesMetadataTrackSubTitle
            subtitleItem.value = (item.subtitle ?? "") as NSString
            playerItem.externalMetadata = [titleItem, subtitleItem]

            if let start = item.startPositionSecs, start > 5, !item.isLive {
                player.seek(to: CMTime(seconds: start, preferredTimescale: 600))
            }

            if !item.isLive {
                timeObserver = player.addPeriodicTimeObserver(
                    forInterval: CMTime(seconds: 10, preferredTimescale: 1),
                    queue: .main
                ) { [weak self] time in
                    guard let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
                    self?.onProgress(time.seconds, duration)
                }
            }

            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: playerItem,
                queue: .main
            ) { [weak self] _ in
                self?.onFinished()
            }

            player.play()
        }

        func teardown() {
            if let timeObserver { player?.removeTimeObserver(timeObserver) }
            if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
            timeObserver = nil
            endObserver = nil
            // Son konumu kaydet.
            if let player, let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
                onProgress(player.currentTime().seconds, duration)
            }
            player?.pause()
            player = nil
            currentURL = nil
        }
    }
}

/// Tam ekran oynatma katmani.
struct PlayerContainer: View {
    @EnvironmentObject private var store: AppStore
    let item: PlaybackItem
    var onDismiss: () -> Void

    var body: some View {
        PlayerView(
            item: item,
            onProgress: { position, duration in
                guard !item.isLive else { return }
                store.saveProgress(
                    itemId: item.itemId,
                    kind: item.kind,
                    episodeId: item.episodeId,
                    position: position,
                    duration: duration,
                    title: item.title,
                    poster: item.poster
                )
            },
            onFinished: onDismiss
        )
        .ignoresSafeArea()
        .onAppear {
            if item.kind == .live { store.pushRecentChannel(item.itemId) }
        }
    }
}
