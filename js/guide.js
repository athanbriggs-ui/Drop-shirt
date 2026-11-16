// Guide tab content. Numbers come from the sources listed in the last section.
const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

export const GUIDE = [
  {
    title: 'How to use this',
    open: true,
    html: `
      <ul>
        <li>Prop your phone where you can see and hear it. Turn the volume up.</li>
        <li>Stay in your stance the whole work period. When a move is called, hit it at the speed the pace asks for and get straight back to your stance.</li>
        <li>Between calls keep moving: small steps, hands working, head up.</li>
        <li>Work and rest lengths are yours to change. 30 on, 30 off is the default because it is easy to hold a high pace that way.</li>
        <li>Turn off <b>Call moves</b> and the app is a plain interval timer for sprints, bike, rope or live goes.</li>
      </ul>`,
  },
  {
    title: 'The three levels',
    html: `
      <ul>
        <li><b>Level 1:</b> shot, sprawl, down block, shot re-shot. The moves every wrestler drills on day one.</li>
        <li><b>Level 2:</b> adds fake-club-shot, club shot, and circling hard left and right, so you set shots up and change angles.</li>
        <li><b>Level 3:</b> adds named shots (double, single, high crotch, sweep single, low single) and chains of two to four moves.</li>
      </ul>
      <p>Coaches run stance and motion at nearly every practice because stance is where all offense and defense starts. Circle back up to your stance after every sprawl.</p>`,
  },
  {
    title: 'The three paces',
    html: `
      <ul>
        <li><b>Easy, warm up:</b> a call every 4 to 6 seconds. Aim for 60 to 75% of max heart rate. Technique first.</li>
        <li><b>Medium, conditioning:</b> a call every 2 to 4 seconds. Aim for 80 to 90% in the work periods, which is where a real match sits.</li>
        <li><b>Hard, weight cut:</b> calls nearly back to back, 40 seconds on and 20 off, for 20 minutes. Heart rate climbs toward 85 to 95%.</li>
      </ul>`,
  },
  {
    title: 'What a match does to your heart',
    html: `
      <ul>
        <li>In a study of college wrestlers, heart rate went from about <span class="num">81%</span> of max in the first period to <span class="num">88%</span> in the second and <span class="num">92%</span> in the third.</li>
        <li>Blood lactate, the burn, rose from about 7.6 to 11.5 mmol/L across the match. That is very high.</li>
        <li>Older match analysis found bursts of roughly 30 to 45 seconds of work with 10 to 20 seconds of break, around 2.5 to 1.</li>
        <li>That is why conditioning here uses short hard bursts, not long slow runs. You are training to work at 85 to 95% and recover fast.</li>
      </ul>`,
  },
  {
    title: 'Heart rate basics',
    html: `
      <ul>
        <li><b>Max heart rate:</b> the app estimates it as 208 minus 0.7 times your age. It is an estimate and can be off by 10 beats or more either way. If you know your real max from an all-out test, enter it.</li>
        <li><b>Zones</b> are slices of your max. Zone 2 is easy, zone 4 is match pace, zone 5 is all out.</li>
        <li><b>Heart rate reserve (Karvonen):</b> if you enter a resting heart rate the app also shows zones worked out from the gap between resting and max. These track real effort more closely.</li>
        <li><b>Heart rate lags.</b> In 30 second bursts it takes several rounds to climb, so judge the first rounds by effort, not the number.</li>
        <li><b>Recovery:</b> check your pulse right after the last round and again a minute later. A bigger drop means better fitness. Watch how it changes over weeks.</li>
        <li><b>Resting heart rate:</b> take it lying down just after you wake up. If it is clearly higher than your normal, you may be run down, sick or dehydrated.</li>
      </ul>`,
  },
  {
    title: 'Why 30 on, 30 off works',
    html: `
      <ul>
        <li>Your breathing and oxygen use stay high for 15 to 20 seconds after you stop, so short rests keep your body working near its top while your legs get a break.</li>
        <li>Research on runners found 30/30 intervals gave more total time near max oxygen use than long intervals.</li>
        <li>A 1 to 1 ratio builds your engine. Moving toward 2 to 1 (40 on, 20 off) is closer to a real match and is much harder.</li>
      </ul>`,
  },
  {
    title: 'Other combat sports',
    html: `
      <ul>
        <li><b>Judo, karate, taekwondo, Muay Thai:</b> match heart rates run from about 83% to near 100% of max. Muay Thai sits around 95%.</li>
        <li><b>Boxing:</b> 3 minute rounds with 1 minute rest. Sparring puts fighters at roughly 85 to 92% of max.</li>
        <li><b>MMA:</b> 5 minute rounds with 1 minute rest. One analysis found close to equal time working and resting inside a round.</li>
        <li><b>Judo:</b> efforts of 20 to 30 seconds with about 10 second breaks, 2 to 1 or 3 to 1.</li>
        <li>To train for those, set the intervals yourself: 180/60 for boxing rounds, 300/60 for MMA, 30/10 for judo.</li>
      </ul>`,
  },
  {
    title: 'Cutting weight without wrecking yourself',
    html: `
      <p>A sweat session takes off water, not fat. It comes straight back when you drink. Use it for the last little bit, not as your plan.</p>
      <ul>
        <li><b>Banned everywhere in school wrestling:</b> rubber or plastic suits, saunas, steam rooms, and overheated rooms. Three college wrestlers died in 1997 doing exactly this.</li>
        <li><b>2% is the line.</b> Losing more than about 2% of your body weight as water starts to cut strength, speed and thinking. At 3% and up the risk to your health climbs.</li>
        <li><b>Slow is the rule:</b> programs limit descent to about 1.5% of body weight a week, with a floor set at your hydration and body fat test.</li>
        <li><b>Stop signs:</b> dizziness, nausea, headache, cramps, chills, confusion, or dry skin when you should be sweating. Stop, cool down, drink, get help. Confusion or collapse is an emergency: call 911 and cool the person fast.</li>
        <li><b>After weigh-in:</b> drink about 1.25 to 1.5 times what you lost, with salt (sports drink, broth, salty food), spread over the time you have.</li>
        <li><b>Better plan:</b> walk around within a few percent of your weight class, eat normally, and never skip meals for more than a day.</li>
      </ul>
      <p>This app is a training tool, not medical advice. If you are under 18, your coach and athletic trainer should be part of any cut.</p>`,
  },
  {
    title: 'Sources',
    html: `
      <ul>
        <li>${a('https://lida.sport-iat.de/ta/Record/4035863', 'Exercise intensity during a freestyle wrestling match')} (heart rate and lactate by period)</li>
        <li>${a('https://simplifaster.com/articles/concurrent-training-freestyle-wrestling-performance/', 'Concurrent training and freestyle wrestling')} (match work to rest)</li>
        <li>${a('https://lida.sport-iat.de/ta/Record/4063638?lng=en', 'Heart rate monitoring during combat sports matches: a brief review')}</li>
        <li>${a('https://www.researchgate.net/profile/Luc_Leger/publication/49739387_VO2_Requirements_of_Boxing_Exercises/links/54f5e1420cf2ca5efefd41c9.pdf', 'VO2 requirements of boxing exercises')}</li>
        <li>${a('https://www.topendsports.com/fitness/karvonen-formula.htm', 'The Karvonen formula')}; Tanaka, Monahan and Seals (2001) for 208 minus 0.7 times age</li>
        <li>${a('https://www.sportsperformancebulletin.com/endurance-training/base-endurance-training/fitness-workouts-increase-vo2max/', 'Billat 30/30 interval research, summarised')}</li>
        <li>${a('https://www.ncaa.org/champion/wrestling-away-troubled-past', 'NCAA: Wrestling away a troubled past')} (weight rules after 1997)</li>
        <li>${a('https://cifss.org/wp-content/uploads/2026/07/Wrestling-2026-27-Blue-Book.pdf', 'CIF 2026-27 wrestling Blue Book')} (high school weight management rules)</li>
        <li>${a('https://doi.org/10.1080/15502783.2025.2467909', 'ISSN position stand on weight cutting in combat sports (2025)')}</li>
        <li>${a('https://www.nata.org/sites/default/files/Heat-Illness-Task-Force-Consensus-Statement.pdf', 'Heat illness task force consensus statement')}</li>
        <li>${a('https://www.gssiweb.org/en/sports-science-exchange/Article/sse-158-hydration-and-thermal-strain-in-youth-sports-responses-and-recommendations-to-minimize-clinical-risk-and-optimize-performance-in-the-heat', 'Hydration and thermal strain in youth sports')}</li>
        <li>${a('https://coachesinsider.com/wrestling/run-the-stance-motion-drill-at-the-end-of-practice-with-keith-gavin-univ-of-pittsburgh', 'Stance and motion drill, Keith Gavin')} and ${a('https://fanaticwrestling.com/blogs/news/smooth-out-your-game-with-shadow-wrestling', 'shadow wrestling')}</li>
      </ul>`,
  },
];
