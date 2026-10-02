# Repository rules — Greater-Turkiye/motion

The handbook is the authority; this file is the short operational version. Read PLAN.md first.

## 1. Keep the documentation true
- Any change to behaviour, a template, a command or the pipeline updates `README.md` (and PLAN.md
  while the plan is being carried out) in the same pull request.

## 2. Red lines that override any request
- No video from a record about positions, movements or deployments of Turkish forces.
- No targeting language, no aimpoint views, no "criticality" scores, no personal data.
- Every video carries its source line and the record's verification status on screen.
- Hooks are the record's own facts: no claim the source does not make.
- Emblems (state arms, alliance marks) only in news context, over their subject on the map, never
  beside our mark or implying endorsement; every emblem's source and licence in SOURCES.md.

## 3. Git and pull requests
- Never commit to `main` after the initial commit; branch, open a pull request, squash-merge.
- Commit messages and PR bodies are in English and describe why.
- **No tool advertising anywhere in the repository.** No "Generated with", no `Co-Authored-By` for
  an assistant, no bot signature, in commits, PR bodies, comments or code comments.
- Never commit secrets or tokens.

## 4. Design: no template-reel look, no "AI slop" (owner, 2026-10-02)
The owner's verdict on the typical news reel (an iceberg illustration, "826 MİLYAR ₺" counting up,
stat pills, "Ama suyun altında:"): rubbish design. None of it in any video, frame or post:
- **No counters.** A number never runs up, ticks or rolls; it appears at its value.
- **No number alone at poster size.** A number stands in a line with what it counts or measures, at
  the size of the facts ("Kiev → Sinop: ~1000 km", "… 150 km içinde: 80 kayıt.").
- **No generated, stock or metaphor imagery**: no icebergs, chessboards, puzzles, hourglasses, faces,
  no image or video from a generative model. The picture is the map, the data and official emblems.
- **No decoration**: no glow, neon or atmosphere halo, particles or stars, light rays, lens flares, gradient
  decor, low-poly lines, fake HUD or scanlines; no bounce or overshoot in motion; no whoosh, tick,
  pop or riser effects; no Stories-style progress bar.
- **No sticker furniture**: no pills of side statistics, no "BÖLÜM 5" series tags, no swipe-bait.
- **No teaser or bait copy**: no "Ama…", "Peki ya…?", "İşte…", "Şok", "Bomba", no question hooks,
  no emoji. Every word on screen is the record's own fact, status or source.
The one generated element is the narration voice, labelled on screen ("SESLENDİRME: YAPAY SES") and
switched off with `MOTION_VOICE=off`. Check every new template, style or post against this list.

## 5. Closing a task
- End with a short factual summary and numbered next steps, recommendation marked; name anything
  the owner must do themselves as its own option.
