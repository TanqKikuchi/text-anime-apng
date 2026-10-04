// Independent .mov verifier using Apple AVFoundation (the media stack Keynote uses).
//
// Usage: swift tools/verify_mov.swift <file.mov> [<frames.rgba> <width> <height> <frameCount>]
//
// Prints one JSON line: playability, codec, track size, frame count, duration and — when the
// source frames are given (straight RGBA, all frames concatenated) — per-frame quality:
// premultiplied-colour PSNR (worst frame), alpha max error and alpha p99 error on edge pixels.
import AVFoundation
import CoreVideo
import Foundation

func fourcc(_ code: FourCharCode) -> String {
  String(bytes: [24, 16, 8, 0].map { UInt8((code >> $0) & 0xff) }, encoding: .ascii) ?? "?"
}

func emit(_ dict: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let asset = AVURLAsset(url: url)
var result: [String: Any] = ["file": url.lastPathComponent]

let sem = DispatchSemaphore(value: 0)
Task {
  defer { sem.signal() }
  result["playable"] = (try? await asset.load(.isPlayable)) ?? false
  guard let track = try? await asset.loadTracks(withMediaType: .video).first else {
    result["error"] = "no video track"
    return
  }
  let fds = (try? await track.load(.formatDescriptions)) ?? []
  result["codec"] = fds.first.map { fourcc(CMFormatDescriptionGetMediaSubType($0)) } ?? "?"
  let size = (try? await track.load(.naturalSize)) ?? .zero
  result["width"] = Int(size.width)
  result["height"] = Int(size.height)
  let duration = (try? await asset.load(.duration)) ?? .zero
  result["duration_s"] = CMTimeGetSeconds(duration)

  guard let reader = try? AVAssetReader(asset: asset) else {
    result["error"] = "reader init failed"
    return
  }
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  ])
  reader.add(output)
  reader.startReading()

  var source: Data? = nil
  var sw = 0, sh = 0, sn = 0
  if args.count >= 6 {
    source = FileManager.default.contents(atPath: args[2])
    sw = Int(args[3])!; sh = Int(args[4])!; sn = Int(args[5])!
  }
  var frames = 0
  var worstPsnr = Double.infinity
  var alphaMax = 0
  var edgeP99Worst = 0
  var sizeMismatch = false
  while let sample = output.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
    defer { frames += 1 }
    guard let src = source, frames < sn else { continue }
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
    if w != sw || h != sh { sizeMismatch = true; continue }
    let rowBytes = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    let frameOffset = frames * sw * sh * 4
    var sse = 0.0
    var count = 0
    var edgeErrors: [Int] = []
    src.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let s = raw.bindMemory(to: UInt8.self)
      for y in 0..<sh {
        for x in 0..<sw {
          let si = frameOffset + (y * sw + x) * 4
          let di = y * rowBytes + x * 4
          let sa = Int(s[si + 3])
          let da = Int(base[di + 3])
          let ae = abs(sa - da)
          alphaMax = max(alphaMax, ae)
          var edge = sa > 0 && sa < 255
          if !edge {
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
              let nx = x + dx, ny = y + dy
              if nx >= 0 && ny >= 0 && nx < sw && ny < sh && Int(s[frameOffset + (ny * sw + nx) * 4 + 3]) != sa { edge = true; break }
            }
          }
          if edge { edgeErrors.append(ae) }
          // Premultiplied colour error (BGRA output; decoded colour treated as straight).
          let srcRGB = [Double(s[si]), Double(s[si + 1]), Double(s[si + 2])].map { $0 * Double(sa) / 255 }
          let dstRGB = [Double(base[di + 2]), Double(base[di + 1]), Double(base[di])].map { $0 * Double(da) / 255 }
          for c in 0..<3 { let d = srcRGB[c] - dstRGB[c]; sse += d * d }
          count += 3
        }
      }
    }
    let mse = sse / Double(max(1, count))
    let psnr = mse == 0 ? 99.0 : 10 * log10(255 * 255 / mse)
    worstPsnr = min(worstPsnr, psnr)
    if !edgeErrors.isEmpty {
      edgeErrors.sort()
      edgeP99Worst = max(edgeP99Worst, edgeErrors[min(edgeErrors.count - 1, Int(Double(edgeErrors.count) * 0.99))])
    }
  }
  result["reader_status"] = reader.status.rawValue
  if let e = reader.error { result["reader_error"] = e.localizedDescription }
  result["frames"] = frames
  if source != nil {
    result["size_mismatch"] = sizeMismatch
    result["worst_psnr_premul_db"] = worstPsnr.isFinite ? (worstPsnr * 100).rounded() / 100 : NSNull()
    result["alpha_max_error"] = alphaMax
    result["alpha_edge_p99_error"] = edgeP99Worst
  }
}
sem.wait()
emit(result)
