import Foundation
import Vision

// Offline OS detector. This only rejects people; it cannot certify a full bag.
while let line = readLine() {
    do {
        guard let data = line.data(using: .utf8),
              let job = try JSONSerialization.jsonObject(with: data) as? [String: String],
              let input = job["input"] else { throw NSError(domain: "input", code: 1) }
        let request = VNDetectHumanRectanglesRequest()
        request.revision = VNDetectHumanRectanglesRequestRevision2
        request.upperBodyOnly = false
        request.usesCPUOnly = true
        try VNImageRequestHandler(url: URL(fileURLWithPath: input), options: [:]).perform([request])
        let detected = (request.results ?? []).contains { $0.confidence >= 0.7 }
        print(detected ? "PERSON_DETECTED" : "NO_PERSON_DETECTED")
    } catch {
        print("PERSON_CHECK_UNAVAILABLE")
    }
}
