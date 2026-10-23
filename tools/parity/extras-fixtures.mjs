// Parity cases for the extras (tests/fixtures/parity/{ical,integrations,obs,calendar}.json): iCal parsing and expansion
// over every RRULE part, DST changes, Windows zone names and the oddities the contract lists; the integrations'
// normalise/apply/public forms; the OBS handshake; the calendar's address guard and merge. Floating times and all-day
// dates are read in the server's local zone, so these are built with TZ=Europe/Oslo (the Rust side pins the same zone).
import { blockedAddress, upcoming } from "../../server/calendar.mjs";
import { applyIntegrations, cleanCalendarUrl, cleanHost, emptyIntegrations, normalizeIntegrations, publicIntegrations } from "../../server/integrations.mjs";
import { occurrences, parseIcs, parseTime, toInstant, zoneOf } from "../../server/ical.mjs";
import { emptyObs, obsAuth, obsStep } from "../../server/obs.mjs";

const wire = (v) => JSON.parse(JSON.stringify(v ?? null));
const out = (v) => (v === undefined ? null : wire(v));
const ms = (iso) => Date.parse(iso);

/** Runs `build` with the process's local zone set to `zone`. */
function inZone(zone, build) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return build();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

const feed = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

/* ---------------- ical ---------------- */

const WINDOWS_NAMES = [
  "UTC", "Coordinated Universal Time", "GMT Standard Time", "Greenwich Standard Time", "W. Europe Standard Time", "Central Europe Standard Time",
  "Central European Standard Time", "Romance Standard Time", "FLE Standard Time", "GTB Standard Time", "E. Europe Standard Time", "Russian Standard Time",
  "Turkey Standard Time", "Israel Standard Time", "Arabian Standard Time", "India Standard Time", "China Standard Time", "Singapore Standard Time",
  "Tokyo Standard Time", "Korea Standard Time", "AUS Eastern Standard Time", "E. Australia Standard Time", "New Zealand Standard Time", "Eastern Standard Time",
  "Central Standard Time", "Mountain Standard Time", "US Mountain Standard Time", "Pacific Standard Time", "Alaskan Standard Time", "Hawaiian Standard Time",
  "Atlantic Standard Time", "E. South America Standard Time", "SA Pacific Standard Time", "South Africa Standard Time",
];

function zoneCases(cases) {
  const names = [
    "W. Europe Standard Time", "Coordinated Universal Time", "Eastern Standard Time", "Europe/Oslo", "europe/oslo", "EUROPE/OSLO", "America/New_York", "Asia/Kolkata", "Asia/Calcutta", "Europe/Kiev", "Europe/Kyiv", "US/Pacific", "Etc/GMT+5", "Etc/UTC", "GMT", "EST", "utc", "UTC ",
    "/mozilla.org/20050126_1/Europe/Berlin", "/a/b/", "/a/b", "//x/Europe/Oslo", "Not/AZone", "", "w. europe standard time", "+01:00", "-0530", "+01", "+24:00", "+01:60", "+1:00", "Australia/Lord_Howe", "Pacific/Chatham",
  ];
  for (const tzid of names) cases.push({ input: { fn: "zoneOf", tzid }, output: out(zoneOf(tzid)) });
  const walls = ["2026-01-15T09:00:00Z", "2026-03-29T02:30:00Z", "2026-03-29T03:30:00Z", "2026-07-01T09:00:00Z", "2026-10-25T01:30:00Z", "2026-10-25T02:30:00Z", "2026-10-25T03:30:00Z", "2040-07-01T12:00:00Z"];
  for (const zone of ["UTC", "Europe/Oslo", "America/New_York", "Australia/Sydney", "Asia/Kolkata", "Pacific/Chatham", "europe/london", "+02:00", null]) {
    for (const wall of walls) cases.push({ input: { fn: "toInstant", wall: ms(wall), zone }, output: toInstant(ms(wall), zone) });
  }
  // The New York gap and fold, the southern hemisphere's.
  for (const [zone, wall] of [["America/New_York", "2026-03-08T02:30:00Z"], ["America/New_York", "2026-11-01T01:30:00Z"], ["Australia/Sydney", "2026-10-04T02:30:00Z"], ["Australia/Sydney", "2026-04-05T02:30:00Z"]]) {
    cases.push({ input: { fn: "toInstant", wall: ms(wall), zone }, output: toInstant(ms(wall), zone) });
  }
}

function timeCases(cases) {
  const values = ["20261015T090000Z", "20261015T090000", "20261015T0900", "20261015T0900Z", "20261015", "  20261015T090000Z  ", "20261015T090000z", "20261015t090000", "garbage", "", "2026101", "20261015T09", "20261015T090000ZZ", "20261015T0900000", "20261015Z",
    "20261301T090000", "20261000T090000", "20260230T090000", "20261015T250000", "00501015T090000", "00991231", "99991231T235959Z", "٢٠٢٦١٠١٥"];
  const params = [{}, { TZID: "Europe/Oslo" }, { TZID: "W. Europe Standard Time" }, { TZID: "Not/AZone" }, { VALUE: "DATE" }, { VALUE: "date" }, { VALUE: "DATE", TZID: "Europe/Oslo" }];
  for (const [i, value] of values.entries()) for (const p of params.slice(0, i < 10 ? 7 : i < 16 ? 3 : 1)) cases.push({ input: { fn: "parseTime", value, params: p }, output: out(parseTime(value, p)) });
}

/** [label, events, from, to]: feeds run through `occurrences`. */
function feedCases() {
  const day = "DTSTART:20261015T090000Z";
  const oslo = (stamp) => `DTSTART;TZID=Europe/Oslo:${stamp}`;
  const sets = [];
  const add = (label, events, from, to) => sets.push({ label, text: feed(...events), from: ms(from), to: ms(to) });
  // Single events.
  add("single events", [
    ["UID:b", "SUMMARY:Later", "DTSTART:20261016T120000Z", "DTEND:20261016T130000Z"],
    ["UID:a", "SUMMARY:Standup\\, daily", "LOCATION:Room 1\\; floor 2", "DTSTART:20261015T090000Z", "DURATION:PT15M"],
    ["UID:c", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261015T100000Z"],
    ["UID:c2", "SUMMARY:Gone too", "STATUS:cancelled", "DTSTART:20261015T100000Z"],
    ["UID:t", "SUMMARY:Tentative", "STATUS:TENTATIVE", "DTSTART:20261015T110000Z"],
    ["UID:d", "SUMMARY:Past", "DTSTART:20261001T100000Z", "DTEND:20261001T110000Z"],
    ["SUMMARY:No uid", "DTSTART:20261015T130000Z"],
    ["UID:n", "DTSTART:20261015T140000Z"],
    ["UID:e", "SUMMARY:Escapes a\\nb\\\\nc\\\\d\\,e", "DTSTART:20261015T150000Z"],
  ], "2026-10-15T00:00:00Z", "2026-10-18T00:00:00Z");
  add("window edges", [
    ["UID:ends", "SUMMARY:Ends at from", "DTSTART:20261014T230000Z", "DTEND:20261015T000000Z"],
    ["UID:ends2", "SUMMARY:Ends after from", "DTSTART:20261014T230000Z", "DTEND:20261015T000001Z"],
    ["UID:starts", "SUMMARY:Starts at to", "DTSTART:20261016T000000Z", "DTEND:20261016T010000Z"],
    ["UID:starts2", "SUMMARY:Starts after to", "DTSTART:20261016T000001Z"],
    ["UID:zero", "SUMMARY:Zero length", "DTSTART:20261015T120000Z", "DTEND:20261015T120000Z"],
    ["UID:neg", "SUMMARY:Ends before start", "DTSTART:20261015T120000Z", "DTEND:20261015T110000Z"],
  ], "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z");
  add("durations", [
    ["UID:d1", "SUMMARY:P1W", day, "DURATION:P1W"],
    ["UID:d2", "SUMMARY:P1DT2H", "DTSTART:20261015T100000Z", "DURATION:P1DT2H"],
    ["UID:d3", "SUMMARY:PT0S", "DTSTART:20261015T110000Z", "DURATION:PT0S"],
    ["UID:d4", "SUMMARY:bad", "DTSTART:20261015T120000Z", "DURATION:1H"],
    ["UID:d5", "SUMMARY:negative", "DTSTART:20261015T130000Z", "DURATION:-PT30M"],
    ["UID:d6", "SUMMARY:PT90M", "DTSTART:20261015T140000Z", "DURATION:PT90M"],
    ["UID:d7", "SUMMARY:end wins", "DTSTART:20261015T150000Z", "DTEND:20261015T153000Z", "DURATION:PT5H"],
    ["UID:d8", "SUMMARY:all day, zero duration", "DTSTART;VALUE=DATE:20261015", "DURATION:PT0S"],
  ], "2026-10-14T00:00:00Z", "2026-10-30T00:00:00Z");
  // Zones, floating and all-day times (the server's zone is Europe/Oslo here).
  add("zones and floating", [
    ["UID:z1", "SUMMARY:Oslo", oslo("20261015T090000"), "DTEND;TZID=Europe/Oslo:20261015T100000"],
    ["UID:z2", "SUMMARY:Quoted", 'DTSTART;TZID="Europe/Oslo":20261015T110000'],
    ["UID:z3", "SUMMARY:Unknown zone is floating", "DTSTART;TZID=Not/AZone:20261015T120000"],
    ["UID:z4", "SUMMARY:Floating", "DTSTART:20261015T130000"],
    ["UID:z5", "SUMMARY:All day", "DTSTART;VALUE=DATE:20261015"],
    ["UID:z6", "SUMMARY:All day multi", "DTSTART;VALUE=DATE:20261015", "DTEND;VALUE=DATE:20261018"],
    ["UID:z7", "SUMMARY:Date with a time", "DTSTART;VALUE=DATE:20261015T143000"],
    ["UID:z8", "SUMMARY:Lowercase param value", "DTSTART;VALUE=date:20261015"],
    ["UID:z9", "SUMMARY:Colon in a quoted param", 'DTSTART;X-NOTE="a:b";TZID=Europe/Oslo:20261015T160000'],
    ["UID:z10", "SUMMARY:Offset zone", "DTSTART;TZID=+0530:20261015T170000"],
    ["UID:z11", "SUMMARY:Mozilla prefix", "DTSTART;TZID=/mozilla.org/20050126_1/America/New_York:20261015T180000"],
    ["UID:z12", "SUMMARY:Lowercase zone", "DTSTART;TZID=europe/london:20261015T190000"],
  ], "2026-10-14T00:00:00Z", "2026-10-22T00:00:00Z");
  add("Windows zone names in summer", WINDOWS_NAMES.map((name, i) => [`UID:w${i}`, `SUMMARY:${name}`, `DTSTART;TZID=${name}:20260701T090000`]), "2026-06-30T00:00:00Z", "2026-07-03T00:00:00Z");
  add("Windows zone names in winter", WINDOWS_NAMES.filter((_, i) => i % 4 === 2).map((name, i) => [`UID:w${i}`, `SUMMARY:${name}`, `DTSTART;TZID=${name}:20260115T090000`]), "2026-01-14T00:00:00Z", "2026-01-17T00:00:00Z");
  // Every RRULE part.
  const rule = (r, start = day) => [["UID:r", "SUMMARY:R", start, `RRULE:${r}`]];
  const week = ["2026-10-15T00:00:00Z", "2026-11-05T00:00:00Z"];
  for (const r of ["FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=DAILY;COUNT=4", "FREQ=DAILY;UNTIL=20261020T090000Z", "FREQ=DAILY;UNTIL=20261020T085959Z", "FREQ=DAILY;UNTIL=20261020", "FREQ=DAILY;UNTIL=20261019T235959",
    "FREQ=DAILY;BYDAY=MO,WE,FR", "FREQ=DAILY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR", "FREQ=DAILY;BYDAY=1MO", "FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;INTERVAL=-2", "FREQ=DAILY;INTERVAL=abc", "FREQ=DAILY;COUNT=0", "FREQ=DAILY;COUNT=abc", "FREQ=DAILY;COUNT=", "FREQ=DAILY;COUNT=2;UNTIL=20261031T000000Z",
    "FREQ=DAILY;COUNT=20;UNTIL=20261018T000000Z", "FREQ=DAILY;UNTIL=garbage", "FREQ=DAILY;UNTIL=20260101T000000Z", "FREQ=daily", "FREQ=HOURLY", "FREQ=SECONDLY;COUNT=3", "COUNT=3", "FREQ=DAILY=x;COUNT=2", "FREQ=DAILY;;COUNT=2;", "freq=DAILY;count=2", "FREQ=DAILY;COUNT=2;COUNT=3", "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=2",
    "FREQ=WEEKLY", "FREQ=WEEKLY;INTERVAL=2", "FREQ=WEEKLY;BYDAY=MO,WE", "FREQ=WEEKLY;BYDAY=SU,SA;WKST=SU", "FREQ=WEEKLY;BYDAY=SU,MO;WKST=MO", "FREQ=WEEKLY;BYDAY=SU,MO;WKST=SU", "FREQ=WEEKLY;BYDAY=MO,TU;WKST=XX", "FREQ=WEEKLY;BYDAY=TH,MO,TH", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=5", "FREQ=WEEKLY;BYDAY=2MO,-1FR", "FREQ=WEEKLY;BYDAY=mo", "FREQ=WEEKLY;BYDAY=", "FREQ=WEEKLY;UNTIL=20261029T090000Z;BYDAY=TH,SU"]) {
    add(`rule ${r}`, rule(r), week[0], week[1]);
  }
  const months = ["2026-10-01T00:00:00Z", "2027-02-01T00:00:00Z"];
  const monthly = (r, start = "DTSTART:20260915T090000Z") => rule(r, start);
  for (const r of ["FREQ=MONTHLY", "FREQ=MONTHLY;INTERVAL=2", "FREQ=MONTHLY;COUNT=3", "FREQ=MONTHLY;BYMONTHDAY=1,15", "FREQ=MONTHLY;BYMONTHDAY=-1", "FREQ=MONTHLY;BYMONTHDAY=-2,30", "FREQ=MONTHLY;BYMONTHDAY=29", "FREQ=MONTHLY;BYMONTHDAY=0", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=MONTHLY;BYMONTHDAY=-31", "FREQ=MONTHLY;BYMONTHDAY=1.5",
    "FREQ=MONTHLY;BYDAY=1MO", "FREQ=MONTHLY;BYDAY=-1FR", "FREQ=MONTHLY;BYDAY=2TU,-2WE", "FREQ=MONTHLY;BYDAY=5FR", "FREQ=MONTHLY;BYDAY=0MO", "FREQ=MONTHLY;BYDAY=TU", "FREQ=MONTHLY;BYDAY=+1MO", "FREQ=MONTHLY;BYDAY=99MO", "FREQ=MONTHLY;BYDAY=-9MO", "FREQ=MONTHLY;BYDAY=1MO;BYMONTHDAY=15",
    "FREQ=MONTHLY;INTERVAL=3;BYDAY=-1SU;UNTIL=20270201T000000Z", "FREQ=MONTHLY;BYMONTH=11,12", "FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3"]) {
    add(`rule ${r}`, monthly(r), months[0], months[1]);
  }
  // The month-without-the-day fix (#122): the series goes on past a month with no match.
  for (const [r, start] of [["FREQ=MONTHLY;BYMONTHDAY=31", "DTSTART:20261031T080000Z"], ["FREQ=MONTHLY", "DTSTART:20260131T080000Z"], ["FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31", "DTSTART:20260831T080000Z"], ["FREQ=MONTHLY;BYMONTHDAY=30", "DTSTART:20261230T080000Z"], ["FREQ=MONTHLY;BYMONTHDAY=29,30,31", "DTSTART:20270128T080000Z"],
    ["FREQ=MONTHLY;BYDAY=5MO", "DTSTART:20260831T080000Z"], ["FREQ=MONTHLY;BYDAY=5FR;COUNT=3", "DTSTART:20260130T080000Z"], ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "DTSTART:20240229T080000Z"], ["FREQ=YEARLY", "DTSTART:20240229T080000Z"], ["FREQ=YEARLY;BYMONTHDAY=29;BYMONTH=2;COUNT=2", "DTSTART:20240229T080000Z"],
    ["FREQ=MONTHLY;BYMONTHDAY=31;UNTIL=20270101T000000Z", "DTSTART:20261031T080000Z"], ["FREQ=MONTHLY;BYMONTHDAY=31;COUNT=2", "DTSTART:20261031T080000Z"]]) {
    add(`rule ${r} from ${start.slice(8, 16)}`, rule(r, start), "2026-09-01T00:00:00Z", "2028-04-01T00:00:00Z");
  }
  for (const r of ["FREQ=YEARLY", "FREQ=YEARLY;INTERVAL=2", "FREQ=YEARLY;BYMONTH=3,9", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "FREQ=YEARLY;BYMONTH=13", "FREQ=YEARLY;BYMONTH=0", "FREQ=YEARLY;BYMONTH=6;BYDAY=1SU", "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=3", "FREQ=YEARLY;BYMONTH=1,12;BYMONTHDAY=1,31;UNTIL=20290101T000000Z", "FREQ=YEARLY;BYMONTHDAY=15"]) {
    add(`rule ${r}`, rule(r, "DTSTART:20260315T090000Z"), "2026-01-01T00:00:00Z", "2030-01-01T00:00:00Z");
  }
  // COUNT with EXDATE and overrides counts the removed occurrences too.
  const exdate = ["EXDATE:20261016T090000Z"];
  add("COUNT counts an EXDATE", [["UID:x", "SUMMARY:X", day, "RRULE:FREQ=DAILY;COUNT=3", ...exdate]], week[0], week[1]);
  add("COUNT counts an override", [["UID:x", "SUMMARY:X", day, "RRULE:FREQ=DAILY;COUNT=3"], ["UID:x", "SUMMARY:Moved", "RECURRENCE-ID:20261016T090000Z", "DTSTART:20261016T150000Z"]], week[0], week[1]);
  add("COUNT counts the occurrences before the window", [["UID:x", "SUMMARY:X", "DTSTART:20261001T090000Z", "RRULE:FREQ=DAILY;COUNT=16"]], week[0], week[1]);
  add("UNTIL on an all-day event includes that day", [["UID:x", "SUMMARY:X", "DTSTART;VALUE=DATE:20261015", "RRULE:FREQ=DAILY;UNTIL=20261018"]], week[0], week[1]);
  add("UNTIL in UTC against a zoned start", [["UID:x", "SUMMARY:X", oslo("20261015T090000"), "RRULE:FREQ=DAILY;UNTIL=20261018T070000Z"]], week[0], week[1]);
  add("UNTIL one second early against a zoned start", [["UID:x", "SUMMARY:X", oslo("20261015T090000"), "RRULE:FREQ=DAILY;UNTIL=20261018T065959Z"]], week[0], week[1]);
  add("UNTIL date-only on a timed event", [["UID:x", "SUMMARY:X", day, "RRULE:FREQ=DAILY;UNTIL=20261018"]], week[0], week[1]);
  add("UNTIL before the start", [["UID:x", "SUMMARY:X", day, "RRULE:FREQ=DAILY;UNTIL=20261001T000000Z"]], week[0], week[1]);
  // EXDATE and RECURRENCE-ID.
  add("weekly with BYDAY, EXDATE and an override", [
    ["UID:w", "SUMMARY:Sync", oslo("20261005T100000"), "DTEND;TZID=Europe/Oslo:20261005T103000", "RRULE:FREQ=WEEKLY;BYDAY=MO,TH", "EXDATE;TZID=Europe/Oslo:20261019T100000"],
    ["UID:w", "SUMMARY:Sync (moved)", "RECURRENCE-ID;TZID=Europe/Oslo:20261015T100000", "DTSTART;TZID=Europe/Oslo:20261015T140000", "DTEND;TZID=Europe/Oslo:20261015T143000"],
  ], "2026-10-15T00:00:00Z", "2026-10-23T00:00:00Z");
  add("EXDATE and override in UTC against a zoned start", [
    ["UID:w", "SUMMARY:Sync", oslo("20261012T100000"), "RRULE:FREQ=DAILY;COUNT=6", "EXDATE:20261014T080000Z,20261015T080000Z"],
    ["UID:w", "SUMMARY:Moved", "RECURRENCE-ID:20261016T080000Z", oslo("20261016T180000")],
  ], week[0], week[1]);
  add("EXDATE lists, repeated lines, all-day and a bad value", [
    ["UID:x", "SUMMARY:X", "DTSTART;VALUE=DATE:20261015", "RRULE:FREQ=DAILY;COUNT=6", "EXDATE;VALUE=DATE:20261016,20261018", "EXDATE;VALUE=DATE:20261019", "EXDATE:garbage"],
  ], week[0], week[1]);
  add("an override with no master, another uid and a cancelled master", [
    ["UID:orphan", "SUMMARY:Orphan", "RECURRENCE-ID:20261016T090000Z", "DTSTART:20261016T100000Z"],
    ["UID:m", "SUMMARY:Master", day, "RRULE:FREQ=DAILY;COUNT=3"],
    ["UID:other", "SUMMARY:Other uid", "RECURRENCE-ID:20261016T090000Z", "DTSTART:20261016T110000Z"],
    ["UID:cm", "SUMMARY:Cancelled master", "STATUS:CANCELLED", "DTSTART:20261015T120000Z", "RRULE:FREQ=DAILY;COUNT=3"],
    ["UID:cm", "SUMMARY:Override of cancelled", "RECURRENCE-ID:20261016T120000Z", "DTSTART:20261016T130000Z"],
  ], week[0], week[1]);
  // DST: a wall time the zone skips or repeats, daily across the change, in a zone and floating.
  const daily = (start, extra = "COUNT=5") => [["UID:dst", "SUMMARY:DST", start, `RRULE:FREQ=DAILY;${extra}`, ...(start.includes("TZID") ? [] : [])]];
  for (const [label, start, from, to] of [
    ["Oslo spring forward, 02:30 is skipped", oslo("20260327T023000"), "2026-03-26T00:00:00Z", "2026-04-05T00:00:00Z"],
    ["Oslo spring forward, 03:30", oslo("20260327T033000"), "2026-03-26T00:00:00Z", "2026-04-05T00:00:00Z"],
    ["Oslo fall back, 02:30 is repeated", oslo("20261023T023000"), "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
    ["Oslo fall back, 01:30", oslo("20261023T013000"), "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
    ["New York spring forward", "DTSTART;TZID=America/New_York:20260306T023000", "2026-03-05T00:00:00Z", "2026-03-14T00:00:00Z"],
    ["New York fall back", "DTSTART;TZID=America/New_York:20261030T013000", "2026-10-29T00:00:00Z", "2026-11-07T00:00:00Z"],
    ["Windows name across the change", "DTSTART;TZID=Eastern Standard Time:20261030T013000", "2026-10-29T00:00:00Z", "2026-11-07T00:00:00Z"],
    ["Sydney spring forward", "DTSTART;TZID=Australia/Sydney:20261002T023000", "2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z"],
    ["Sydney fall back", "DTSTART;TZID=Australia/Sydney:20260403T023000", "2026-04-02T00:00:00Z", "2026-04-10T00:00:00Z"],
    ["Lord Howe half-hour change", "DTSTART;TZID=Australia/Lord_Howe:20261002T023000", "2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z"],
    ["London", "DTSTART;TZID=Europe/London:20261023T013000", "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
    ["floating (Oslo) spring forward", "DTSTART:20260327T023000", "2026-03-26T00:00:00Z", "2026-04-05T00:00:00Z"],
    ["floating (Oslo) fall back", "DTSTART:20261023T023000", "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
    ["all-day (Oslo) across both", "DTSTART;VALUE=DATE:20261023", "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
    ["UTC", "DTSTART:20261023T023000Z", "2026-10-22T00:00:00Z", "2026-11-01T00:00:00Z"],
  ]) {
    add(`daily ${label}`, daily(start, "COUNT=9"), from, to);
  }
  add("weekly across DST in a zone", [["UID:wk", "SUMMARY:W", oslo("20261001T093000"), "RRULE:FREQ=WEEKLY;BYDAY=TH,SU", "DTEND;TZID=Europe/Oslo:20261001T103000"]], "2026-10-15T00:00:00Z", "2026-11-12T00:00:00Z");
  add("monthly across DST in a zone", [["UID:mo", "SUMMARY:M", "DTSTART;TZID=America/New_York:20261001T090000", "RRULE:FREQ=MONTHLY;BYDAY=1SU"]], "2026-09-01T00:00:00Z", "2027-03-01T00:00:00Z");
  // Odd feeds.
  add("odd lines", [
    ["UID:f", "SUMMARY:A very", " long title", "DTSTART:20261015T090000Z"],
    ["UID:f2", "SUMMARY:Tab fold", "\tcontinued", "DTSTART:20261015T100000Z"],
    ["uid:lower", "summary:Lowercase names", "dtstart:20261015T110000Z"],
    ["UID:nocolon", "SUMMARY", "DTSTART:20261015T120000Z"],
    ["UID:valarm", "SUMMARY:With alarm", "DTSTART:20261015T130000Z", "BEGIN:VALARM", "ACTION:DISPLAY", "SUMMARY:Alarm text", "END:VALARM"],
    ["UID:nostart", "SUMMARY:No start"],
    ["UID:badstart", "SUMMARY:Bad start", "DTSTART:tomorrow"],
    ["UID:laststart", "SUMMARY:Last good start wins", "DTSTART:20261015T140000Z", "DTSTART:garbage"],
    ["UID:year", "SUMMARY:Year 50", "DTSTART:00501015T090000Z"],
    ["UID:month13", "SUMMARY:Month 13", "DTSTART:20261301T090000Z"],
    ["UID:short", "SUMMARY:No seconds", "DTSTART:20261015T1500"],
  ], "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z");
  add("nested BEGIN resets the event", [["UID:a", "SUMMARY:First", "BEGIN:VEVENT", "UID:b", "SUMMARY:Second", "DTSTART:20261015T090000Z"]], "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z");
  sets.push({ label: "CR LF and bare LF folds", text: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Bare LF\n continues\r\nDTSTART:20261015T090000Z\r\n\r\nEND:VEVENT\nEND:VCALENDAR", from: ms("2026-10-15T00:00:00Z"), to: ms("2026-10-16T00:00:00Z") });
  add("no events", [], "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z");
  return sets;
}

export function icalCases() {
  return inZone("Europe/Oslo", () => {
    const cases = [];
    zoneCases(cases);
    timeCases(cases);
    const sets = feedCases();
    for (const s of sets.filter((x) => !x.label.startsWith("rule "))) cases.push({ input: { fn: "occurrences", label: s.label, text: s.text, from: s.from, to: s.to }, output: out(occurrences(parseIcs(s.text), s.from, s.to)) });
    // The parsed form of a few feeds: the rule fields, the oddities of a line, the zones.
    const parsed = ["odd lines", "EXDATE lists, repeated lines, all-day and a bad value", "single events", "zones and floating", "nested BEGIN resets the event", "durations"];
    for (const s of sets.filter((x) => parsed.includes(x.label) || /^rule FREQ=(DAILY;(COUNT=abc|UNTIL=garbage)|WEEKLY;BYDAY=SU,MO;WKST=XX|MONTHLY;BYDAY=2TU|YEARLY;BYMONTH=13|MONTHLY;BYMONTHDAY=1\.5|WEEKLY;BYDAY=SU,SA;WKST=SU|DAILY;COUNT=2;UNTIL)/.test(x.label))) {
      cases.push({ input: { fn: "parseIcs", label: s.label, text: s.text }, output: out(parseIcs(s.text)) });
    }
    return cases;
  });
}

/** The expansion of each RRULE part (tests/fixtures/parity/ical-rules.json). */
export function icalRulesCases() {
  return inZone("Europe/Oslo", () =>
    feedCases()
      .filter((s) => s.label.startsWith("rule "))
      .map((s) => ({ input: { fn: "occurrences", label: s.label, text: s.text, from: s.from, to: s.to }, output: out(occurrences(parseIcs(s.text), s.from, s.to)) }))
  );
}

/* ---------------- integrations ---------------- */

const counterIds = () => {
  let n = 0;
  return () => `id${++n}`;
};

export function integrationsCases() {
  const cases = [];
  const hosts = ["127.0.0.1", "obs-pc", "OBS_PC.local", "a.b-c_d", "[::1]", "[fe80::1]", "[xyz]", "[]", "[::1", "::1", "a b", "ws://x", "host/path", "host:4455", "", "  obs  ", 5, null, true, ["a"], {}, "a".repeat(253), "a".repeat(254), "é", "-", "."];
  for (const value of hosts) cases.push({ input: { fn: "cleanHost", value }, output: cleanHost(value) });
  const urls = ["https://calendar.example.com/private/abc/basic.ics", "webcal://calendar.example.com/x.ics", "WEBCAL://Calendar.Example.com/x", "webcals://a.example/x", "webcal:/a.example/x", "https://Example.COM:443/a b?x=1#f", "http://[::1]:8080/x", "https://user:pw@host.example/x", "https://host.example", "http://a.example:80", "https://a.example:80/x",
    "ftp://a.example/x", "file:///c:/x.ics", "javascript:alert(1)", "//host/x", "", "  https://a.example/x  ", "https://exa mple.com", "https://xn--e1afmkfd.example/p", "https://ПРИМЕР.рф/x", "HTTP://A.B/C", "http://0x7f.1/", "https://256.1.1.1/", "https://a.example/%zz", "https://a.example/ü?q=ü", "https://a.example/" + "x".repeat(2100), 5, null, {}, "https://a.example/\u{1f600}"];
  for (const value of urls) cases.push({ input: { fn: "cleanCalendarUrl", value }, output: out(cleanCalendarUrl(value)) });

  const link = (id, label, url) => ({ id, label, url });
  const raws = [
    null, "x", [], {}, { obs: "x" }, { obs: { host: "obs-pc", port: 4456, password: "pw" } }, { obs: { host: "bad host", port: 99999 } }, { obs: { host: "h", port: "80" } }, { obs: { host: "h", port: null } }, { obs: { host: "h", port: 1.5 } }, { obs: { host: "h", port: true } }, { obs: { host: "h", port: "0x50" } }, { obs: { host: "h", port: " 80 " } },
    { obs: { host: "h", port: 0 } }, { obs: { host: "h", port: 65535 } }, { obs: { host: "h", port: 65536 } }, { obs: { host: "h", port: "1e3" } }, { obs: { host: "h", port: [80] } }, { obs: { host: "h", password: 5 } }, { obs: { host: "h", password: "  keep spaces  " } }, { obs: { host: "h", password: "p".repeat(600) } },
    { calendar: "x" }, { calendar: { links: "x" } }, { calendar: { links: [] } },
    { calendar: { links: [{ id: "a", label: "  A  ", url: "webcal://a.example/a.ics" }, { id: "", url: "https://b.example/b" }, { id: "c", url: "ftp://c" }, "x", null, { id: "d" }, { id: "e".repeat(70), url: "https://e.example/e" }, { id: "f", label: "L".repeat(50), url: "https://f.example/f" }] } },
    { calendar: { links: Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, url: `https://h${i}.example/x` })) } },
    { obs: { host: "h" }, calendar: { links: [{ id: "a", url: "https://a.example/a" }] }, extra: 1 },
  ];
  for (const raw of raws) {
    const state = normalizeIntegrations(raw);
    cases.push({ input: { fn: "normalizeIntegrations", raw: wire(raw) }, output: state });
    cases.push({ input: { fn: "publicIntegrations", state: wire(state) }, output: publicIntegrations(state) });
  }

  const stored = { obs: { host: "obs-pc", port: 4455, password: "pw" }, calendar: { links: [link("id1", "A", "https://a.example/a.ics"), link("id2", "B", "https://b.example:8443/b.ics")] } };
  const states = [emptyIntegrations(), stored];
  const patches = [
    null, "x", [], 5, {}, { nope: 1 }, { obs: null }, { obs: "x" }, { obs: [] }, { obs: {} }, { obs: { host: "127.0.0.1", password: "hunter2" } }, { obs: { port: 4456 } }, { obs: { port: "abc" } }, { obs: { port: null } }, { obs: { port: true } }, { obs: { password: "" } }, { obs: { password: 5 } }, { obs: { password: null } }, { obs: { password: "p".repeat(600) } },
    { obs: { host: "ws://x/y" } }, { obs: { host: "" } }, { obs: { host: "  " } }, { obs: { host: 7 } }, { obs: { host: null } }, { obs: { host: "[::1]", port: 1 } }, { obs: { host: "ok", extra: 1 } },
    { calendar: null }, { calendar: {} }, { calendar: { links: null } }, { calendar: { links: {} } }, { calendar: { links: [] } }, { calendar: { links: [1] } }, { calendar: { links: [null] } }, { calendar: { links: [[]] } }, { calendar: { links: [{}] } },
    { calendar: { links: [{ url: "webcal://calendar.example.com/private/abc/basic.ics", label: "Work" }] } },
    { calendar: { links: [{ url: "https://a.example/a.ics" }, { url: "https://b.example/b.ics" }] } },
    { calendar: { links: [{ url: "file:///c:/x.ics" }] } }, { calendar: { links: [{ url: 5 }] } },
    { calendar: { links: [{ id: "id2", label: "B2" }, { url: "https://c.example/c.ics" }] } },
    { calendar: { links: [{ id: "id2", url: "https://other.example/x" }] } },
    { calendar: { links: [{ id: "id1", label: null }] } }, { calendar: { links: [{ id: "id1", label: 5 }] } }, { calendar: { links: [{ id: "id1", label: "  spaced  " }, { id: "id1" }] } },
    { calendar: { links: [{ id: 5, url: "https://n.example/n" }] } }, { calendar: { links: [{ id: "nope", url: "https://n.example/n", label: "N" }] } },
    { calendar: { links: Array.from({ length: 10 }, (_, i) => ({ url: `https://h${i}.example/x` })) } },
    { calendar: { links: Array.from({ length: 11 }, (_, i) => ({ url: `https://h${i}.example/x` })) } },
    { obs: { host: "h", port: 1, password: "p" }, calendar: { links: [{ id: "id2" }] } }, { obs: { host: "bad host" }, calendar: { links: [{ url: "ftp://x" }] } },
  ];
  for (const state of states) {
    for (const patch of patches) {
      const result = applyIntegrations(state, patch, counterIds());
      cases.push({ input: { fn: "applyIntegrations", state: wire(state), patch: wire(patch) }, output: result.error ? { error: result.error } : { state: result.state } });
    }
  }
  return cases;
}

/* ---------------- obs ---------------- */

export function obsCases() {
  const cases = [];
  const vectors = [
    ["supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY="],
    ["pw", "s", "c"], ["", "", ""], ["pässwörd 密码", "säl", "chall\u{1f600}"],
  ];
  for (const [password, salt, challenge] of vectors) cases.push({ input: { fn: "obsAuth", password, salt, challenge }, output: obsAuth(password, salt, challenge) });
  const states = [emptyObs(true), { configured: true, connected: true, streaming: true, recording: false }, { configured: true, connected: true, streaming: false, recording: true }];
  const outputs = (type, active) => ({ op: 5, d: { eventType: type, eventData: { outputActive: active } } });
  const reply = (id, result, active) => ({ op: 7, d: { requestId: id, requestStatus: { result }, responseData: { outputActive: active } } });
  const messages = [
    { op: 0, d: { rpcVersion: 1, authentication: { salt: "s", challenge: "c" } } }, { op: 0, d: { rpcVersion: 1 } }, { op: 0, d: { authentication: null } }, { op: 0, d: { authentication: "" } }, { op: 0, d: { authentication: true } }, { op: 0, d: { authentication: { salt: 5 } } }, { op: 0, d: { authentication: { salt: "s" } } }, { op: 0, d: { authentication: [] } }, { op: 0 }, { op: 0, d: "x" },
    { op: 2, d: {} }, { op: 2 }, { op: 2, d: null },
    outputs("StreamStateChanged", true), outputs("StreamStateChanged", false), outputs("RecordStateChanged", true), outputs("RecordStateChanged", false), outputs("StreamStateChanged", "true"), outputs("Other", true), { op: 5, d: { eventType: "StreamStateChanged" } }, { op: 5, d: null }, { op: 5 },
    reply("stream", true, true), reply("record", true, true), reply("stream", false, true), reply("record", true, false), reply("other", true, true), reply("stream", "true", true), { op: 7, d: { requestId: "stream", requestStatus: { result: true } } }, { op: 7, d: {} },
    { op: 1 }, { op: 3 }, { op: "2" }, { op: 2.0 }, {}, null, "x", 5, [], { d: {} },
  ];
  for (const state of states) for (const message of messages) for (const password of ["pw"]) cases.push({ input: { fn: "obsStep", state, message: wire(message), password }, output: obsStep(state, message, password) });
  return cases;
}

/* ---------------- calendar ---------------- */

export function calendarCases() {
  const cases = [];
  const ips = ["127.0.0.1", "127.255.255.255", "0.0.0.0", "0.1.2.3", "169.254.169.254", "169.253.0.1", "224.0.0.1", "239.255.255.255", "255.255.255.255", "223.255.255.255", "::1", "::", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::FFFF:A9FE:A9FE", "64:ff9b::7f00:1", "::127.0.0.1", "0:0:0:0:0:0:0:1", "0000::", "FE80::1%eth0", "febf::1", "ff02::1", "not an ip",
    "192.168.1.10", "10.0.0.5", "10.255.255.255", "172.15.255.255", "172.16.0.1", "172.31.255.255", "172.32.0.1", "100.63.255.255", "100.64.0.1", "100.127.255.255", "100.128.0.1", "93.184.216.34", "2606:4700::1", "::ffff:c0a8:10a", "::ffff:192.168.1.10", "64:ff9b::5db8:d822", "64:ff9b::a00:1", "2001:db8::1", "fec0::1", "fc00::1", "fd12:3456::1", "fe00::1",
    "::ffff:0:0", "::ffff:0.0.0.0", "::1.2.3.4", "::0.0.0.1", "::2", "::ffff:", "1::", "", " ", "127.0.0.1 ", " 127.0.0.1", "127.1", "1.2.3", "1.2.3.4.5", "256.0.0.1", "01.1.1.1", "[::1]", "::1%", "%eth0", "fe80::1%", "1:2:3:4:5:6:7:8", "1::2::3", "::g", "localhost", "example.com"];
  for (const ip of ips) for (const blockLan of [false, true]) cases.push({ input: { fn: "blockedAddress", ip, blockLan }, output: blockedAddress(ip, blockLan) });
  return cases;
}

export function upcomingCases() {
  return inZone("Europe/Oslo", () => {
    const now = ms("2026-10-15T08:00:00Z");
    const ics = (uid, start, title) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${start}\r\nDURATION:PT30M\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const many = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:m\r\nSUMMARY:Often\r\nDTSTART:20261015T080000Z\r\nDURATION:PT1M\r\nRRULE:FREQ=DAILY;BYHOUR=1\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const hourly = ["BEGIN:VCALENDAR", ...Array.from({ length: 60 }, (_, i) => `BEGIN:VEVENT\r\nUID:h${i}\r\nSUMMARY:E${i}\r\nDTSTART:2026101${5 + (i % 2)}T${String(i % 24).padStart(2, "0")}0000Z\r\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
    const feedsList = [
      [[ics("b", "20261015T120000Z", "Lunch"), "garbage", ics("a", "20261015T090000Z", "Standup"), ics("c", "20261020T090000Z", "Far")], now],
      [[ics("a", "20261015T070000Z", "Running"), ics("b", "20261015T065959Z", "Just over"), ics("c", "20261016T200000Z", "Edge"), ics("d", "20261016T200001Z", "Past the edge")], now],
      [[many, ics("a", "20261015T090000Z", "Standup")], now],
      [[hourly], now],
      [[], now],
      [["", ics("a", "20261015T090000Z", "Standup")], now],
    ];
    return feedsList.map(([feeds, at]) => ({ input: { fn: "upcoming", feeds, now: at }, output: out(upcoming(feeds, at)) }));
  });
}

export const calendarModule = () => [...calendarCases(), ...upcomingCases()];
