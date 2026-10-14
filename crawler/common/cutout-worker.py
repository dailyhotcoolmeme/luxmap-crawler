"""Pinned offline CPU foreground masks. No network or image generation."""
import errno
import hashlib
import importlib.metadata
import json
import socket
import sys
from pathlib import Path

MODEL_SHA = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"


def require_isolation():
    for host in ("1.1.1.1", "127.0.0.1"):
        try:
            with socket.socket() as connection:
                connection.settimeout(1)
                connection.connect((host, 443))
        except OSError as error:
            if error.errno in (errno.EPERM, errno.EACCES):
                continue
        raise RuntimeError("NETWORK_NOT_DENIED")


def verify_runtime(model):
    require_isolation()
    if hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_SHA:
        raise RuntimeError("MODEL_CHECKSUM")
    requirements = Path(__file__).with_name("cutout-requirements.txt").read_text().splitlines()
    allowed = {"pip", "setuptools"}
    for requirement in requirements:
        name, version = requirement.split("==")
        if importlib.metadata.version(name) != version:
            raise RuntimeError("RUNTIME_VERSION")
        allowed.add(name.lower())
    if any(d.metadata["Name"].lower() not in allowed for d in importlib.metadata.distributions()):
        raise RuntimeError("RUNTIME_DEPENDENCY")


def make_cutout(original, session, np, Image):
    # Official PNG alpha is source evidence, not a generated mask. Preserve it
    # rather than discarding transparency and segmenting hidden RGB pixels.
    if original.mode == "RGBA" and original.getchannel("A").getextrema()[0] < 255:
        mask = original.getchannel("A")
        if mask.getextrema()[1] == 0:
            raise RuntimeError("EMPTY_MASK")
        bounds = mask.point(lambda value: 255 if value > 16 else 0).getbbox()
        if bounds is None:
            raise RuntimeError("EMPTY_BOUNDS")
        cutout = original.crop(bounds)
        ratio = min(820 / cutout.width, 820 / cutout.height)
        cutout = cutout.resize((max(1, round(cutout.width * ratio)), max(1, round(cutout.height * ratio))), Image.Resampling.LANCZOS)
        centered = Image.new("RGBA", (960, 960), (0, 0, 0, 0))
        centered.alpha_composite(cutout, ((960-cutout.width)//2, (960-cutout.height)//2))
        return centered
    original = original.convert("RGB")
    pixels = np.asarray(original.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
    pixels /= max(float(pixels.max()), 1e-6)
    pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    tensor = pixels.transpose(2, 0, 1)[None].astype(np.float32)
    prediction = session.run(None, {session.get_inputs()[0].name: tensor})[0][0, 0]
    minimum, maximum = float(prediction.min()), float(prediction.max())
    if maximum - minimum <= 1e-6:
        raise RuntimeError("EMPTY_MASK")
    mask = Image.fromarray(((prediction-minimum)/(maximum-minimum)*255).clip(0, 255).astype("uint8"))
    mask = mask.resize(original.size, Image.Resampling.LANCZOS)
    foreground = float((np.asarray(mask) > 16).mean())
    if not .01 < foreground < .85:
        raise RuntimeError("MASK_RANGE")
    bounds = mask.point(lambda value: 255 if value > 16 else 0).getbbox()
    if bounds is None:
        raise RuntimeError("EMPTY_BOUNDS")
    left, top, right, bottom = bounds
    cutout = original.convert("RGBA")
    cutout.putalpha(mask)
    cutout = cutout.crop((max(0,left-4), max(0,top-4), min(original.width,right+4), min(original.height,bottom+4)))
    ratio = min(820 / cutout.width, 820 / cutout.height)
    cutout = cutout.resize((max(1, round(cutout.width * ratio)), max(1, round(cutout.height * ratio))), Image.Resampling.LANCZOS)
    centered = Image.new("RGBA", (960, 960), (0, 0, 0, 0))
    centered.alpha_composite(cutout, ((960-cutout.width)//2, (960-cutout.height)//2))
    return centered


def main():
    model = Path(sys.argv[1]).resolve()
    verify_runtime(model)
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 24000000
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    settings.inter_op_num_threads = 1
    settings.log_severity_level = 3
    session = ort.InferenceSession(str(model), sess_options=settings, providers=["CPUExecutionProvider"])
    if session.get_providers() != ["CPUExecutionProvider"]:
        raise RuntimeError("BACKEND")
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        job = json.loads(line)
        try:
            source, destination = Path(job["input"]), Path(job["output"])
            if source.stat().st_size > 12*1024*1024 or destination.suffix != ".webp":
                raise RuntimeError("SOURCE_LIMIT")
            with Image.open(source) as image:
                if image.width*image.height > 24000000 or min(image.size) < 200:
                    raise RuntimeError("PIXEL_LIMIT")
                original = ImageOps.exif_transpose(image).convert("RGBA")
            result = make_cutout(original, session, np, Image)
            result.save(destination, "WEBP", quality=86, method=4)
            with Image.open(destination) as stored:
                if stored.size != (960,960) or stored.getpixel((0,0))[3] != 0:
                    raise RuntimeError("OUTPUT_VERIFY")
            print(json.dumps({"ok": True}), flush=True)
        except Exception as error:
            code = str(error) if isinstance(error, RuntimeError) else "CUTOUT_FAILED"
            print(json.dumps({"ok": False, "code": code[:40]}), flush=True)
            if code in ("MASK_RANGE", "EMPTY_MASK", "EMPTY_BOUNDS"):
                continue
            return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print(json.dumps({"ok": False, "code": "OFFLINE_RUNTIME_FAILED"}), flush=True)
        sys.exit(78)
