# Deploying Iron Log

Iron Log lives at **https://theodramatist.github.io/iron-log/**.

The workflow in `.github/workflows/deploy.yml` publishes it. Every push to `main` installs the app, runs the tests and the linter, builds it, and puts `dist/` on GitHub Pages. Pull requests run the same checks but don't publish. The app is static files and nothing else: no server, no accounts, and no data sent anywhere.

## The first deploy

Until now, GitHub Pages has published the old app straight from the files on `main`. Switch Pages over to the workflow **before** this branch merges. If you merge first, Pages publishes the raw source, which doesn't run, and fixing it takes the switch below and then a manual run of the workflow.

1. On GitHub, open the repository, then **Settings**, then **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge the branch into `main`.
4. Open the **Actions** tab and watch the **Deploy** run. When both of its jobs are green, the new app is live.

## Deploying again

Any push to `main` deploys. To publish again without a change, open **Actions**, pick **Deploy**, and tap **Run workflow** on `main`.

Phones update on their own. The next time Iron Log opens with a signal, it fetches the new version in the background, and Today shows "Update ready." The update takes effect the next time you open the app, or right away with **Update now**. It never reloads during a session.

To try a production build on a computer first:

```bash
npm run build
```

```bash
npm run preview
```

Then open `http://localhost:4173/iron-log/`.

## Putting it on the iPhone

1. If the old Iron Log is on your Home Screen, press and hold its icon and remove it. It holds nothing you need, and the Home Screen keeps the icon it saved when an app was added, so a fresh add is the only way to get the new one.
2. In Safari, go to **https://theodramatist.github.io/iron-log/**.
3. Tap **Share**—on newer iPhones it may sit under the **•••** button—then **Add to Home Screen**. If Safari shows **Open as Web App**, leave it on. Tap **Add**.
4. Open Iron Log from the Home Screen while you have a signal, and do setup there, not in a Safari tab. iPhone has long kept a Home Screen app's data apart from Safari's, so a log started in Safari may not show up in the app.

After that first launch, it opens and works with no signal at all, airplane mode included. Your log stays on the phone through closing the app and restarting the phone.

## Logging sessions you've already done

Setup logs Monday, November 2, for you. It asks how that session's last sets felt, so have them in mind. If yesterday was Monday, that's all it takes.

For any later day that has already passed, start from Today:

1. Tap **Log a past session**. The date starts at yesterday.
2. Pick **Lifting** or **Conditioning**, whichever you did. It starts on what the plan had for that day.
3. Tap **Start entry**, answer the check-in for that day, and log the session the way you would in the gym. A past entry has no rest timer.

Any day from November 2 through yesterday can be logged this way. If you log a day that has later sessions after it, the app works those sessions out again.

## Keeping your data safe

The log lives only on the phone. In **Settings**, under **Backups**, tap **Export** now and then, and save the file to Files or iCloud Drive. Today reminds you when a backup is due. If the phone is lost or the app is removed, that file is the only copy, and **Import** brings it back.
