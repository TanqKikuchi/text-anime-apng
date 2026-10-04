import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let url = URL(fileURLWithPath: CommandLine.arguments[1]); let out = CommandLine.arguments[2]
let times = CommandLine.arguments[3].split(separator: ",").map { Double($0)! }
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset); gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
let sem = DispatchSemaphore(value: 0)
Task {
  let d = (try? await asset.load(.duration)) ?? .zero
  print("duration", CMTimeGetSeconds(d))
  for (i, t) in times.enumerated() {
    do {
      let (img, actual) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 600))
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "\(out)/f\(i).png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
      print("frame", i, "t", CMTimeGetSeconds(actual), img.width, img.height)
    } catch { print("err", t, error.localizedDescription) }
  }
  sem.signal()
}
sem.wait()
