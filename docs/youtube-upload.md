# YouTube upload

`produce.yml` generates a factual title and description from the same source and verification metadata used in the share text, then uploads the MP4 with YouTube Data API v3. The API request marks synthetic narration via `status.containsSyntheticMedia`. Keep the disclosure in the description and check YouTube Studio's altered-content setting when required by current policy.

The upload step is skipped when no YouTube OAuth secrets are configured and does not block GitHub Release or Pages publication. Its default privacy is `unlisted`; set the repository variable `YOUTUBE_PRIVACY_STATUS` to `public` only after the channel, OAuth app, API project and content workflow are ready. YouTube may force uploads from an unaudited API project to private regardless of the requested status.

## One-time Google setup

1. In Google Cloud Console, enable **YouTube Data API v3** and create an OAuth consent screen for the account that owns the channel.
2. Create OAuth credentials and authorize the channel account with the narrow scope `https://www.googleapis.com/auth/youtube.upload`. Generate an offline refresh token using the official OAuth Playground or an installed-app OAuth flow. Never paste a token into chat or commit it.
3. Add these repository Actions secrets in `Greater-Turkiye/motion`:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REFRESH_TOKEN`
4. Add the Actions variable `YOUTUBE_PRIVACY_STATUS` as `unlisted` for initial tests. Set it to `public` after confirming OAuth, channel, disclosure and API project audit status.

Google refresh tokens for an OAuth consent screen left in Testing can expire after seven days for these scopes. A durable unattended upload setup needs the consent app published as appropriate and may require Google's verification/API audit. Service accounts do not work for ordinary YouTube channels.

`#Shorts` and place/topic hashtags are used, while the title remains the source-backed event headline. No view-count promises, fabricated urgency or casualty embellishment are generated; metadata cannot guarantee virality.

Music and effects use the repository's Freesound CC0 kit (`LICENSES.md`). For a trend song, use YouTube's own Shorts music picker after upload; a platform-library license does not transfer to a file embedded and cross-posted elsewhere.

Official references: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [video resource/status fields](https://developers.google.com/youtube/v3/docs/videos#status), [OAuth for installed apps](https://developers.google.com/youtube/v3/guides/auth/installed-apps).