# Nov22 dialogue-only ten-ticker release

This branch is a release staging template, NOT a public page or completed
experiment. Wait for the corrected combined preparation and ten-lane run 45438481736 to
succeed; retrieve only the public export artifact and exact manifest hash.
Run `node scripts/stage-dialogue-ten.cjs /path/to/extracted/export MANIFEST_SHA256`.
This validates all 430 actual outputs, ten-lane input policies, native evidence
coverage, exact original part/block identities and float dialogue sample
coverage, copies only allowed assets, generates a source-locked edition of the
existing Nov22 layout, and adds it to build/HTTPS/browser gates. No synthetic
or empty outputs may be deployed. Use the existing protected main PR process.
The new route is /streaming-lab/ten-tickers-nov22/ after successful deployment.
The original video and CSS are reused from the existing nine-ticker pages.
The original video retains the raw mix; exact dialogue input tracks are
available in the compact data notes. The only layout difference is one extra
ticker in the same ticker region. Repetition is labeled unresolved, never
automatically called a decoder loop or an accuracy claim.
