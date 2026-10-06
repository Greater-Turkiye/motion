"""Does a photograph show a recognisable face? Our videos carry no personal data (CLAUDE.md section 2),
so a story's photograph is used only when no face in it is large enough to recognise.

    python tools/scene/faces.py <image>      # exit 0: usable; exit 1: a recognisable face; prints JSON

OpenCV's Haar cascades, frontal and profile (both sides), on the image scaled to 1000 px wide. A face
is "recognisable" when its box is wider than 4 % of the image (40 px at that scale): a sailor in
close-up, officers at a briefing table; crews on a distant deck stay below it. A detector misses
faces too (turned, shadowed), so the threshold is set low and anything near it is refused.
"""
import json, sys
import cv2

LIMIT = 0.04


def faces(path):
    img = cv2.imread(path)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    h, w = img.shape[:2]
    k = 1000 / w
    img = cv2.resize(img, (1000, int(h * k)))
    grey = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    boxes = []
    for name in ("haarcascade_frontalface_default.xml", "haarcascade_profileface.xml"):
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + name)
        for flip in (False, True) if "profile" in name else (False,):
            g = cv2.flip(grey, 1) if flip else grey
            for (x, y, fw, fh) in cascade.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(24, 24)):
                boxes.append(int(fw))
    largest = max(boxes, default=0) / 1000
    return {"faces": len(boxes), "largest": round(largest, 3), "usable": largest <= LIMIT}


if __name__ == "__main__":
    r = faces(sys.argv[1])
    print(json.dumps(r))
    sys.exit(0 if r["usable"] else 1)
