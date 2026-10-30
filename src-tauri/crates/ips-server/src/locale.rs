// `Intl.DateTimeFormat.supportedLocalesOf([v]).length > 0` without ICU: `v` must be a well-formed Unicode BCP 47
// locale id (ECMA-402's structural check, which throws otherwise) whose language Node's ICU (77.1) formats dates in.
// LANGUAGES is every two- and three-letter language that call accepts, aliases included (`iw`, `mo`, `sh`);
// tests/fixtures/parity/config-settings.json holds the same list from Node, and the parity test compares them.

/// The languages Node's ICU has date formats for, sorted.
pub const LANGUAGES: &[&str] = &[
    "adp", "af", "afr", "agq", "ak", "aka", "alb", "als", "am", "amh", "ar", "ara", "arb", "arm", "ars", "as", "asa",
    "asm", "ast", "az", "aze", "azj", "bam", "baq", "bas", "be", "bel", "bem", "ben", "bez", "bg", "bgc", "bho", "bih",
    "blo", "bm", "bn", "bo", "bod", "bos", "br", "bre", "brx", "bs", "bul", "bur", "bxk", "ca", "cat", "ccp", "ce",
    "ceb", "ces", "cgg", "che", "chi", "chr", "chv", "ckb", "cld", "cls", "cmn", "cnr", "cor", "cs", "csw", "cv", "cy",
    "cym", "cze", "da", "dan", "dav", "de", "deu", "dgo", "dje", "doi", "drh", "drw", "dsb", "dua", "dut", "dyo", "dz",
    "dzo", "ebu", "ee", "ekk", "el", "ell", "en", "eng", "eo", "epo", "es", "est", "et", "eu", "eus", "ewe", "ewo",
    "fa", "fao", "fas", "fat", "ff", "fi", "fil", "fin", "fo", "fr", "fra", "fre", "fry", "fuc", "ful", "fur", "fy",
    "ga", "gaa", "gaz", "gd", "geo", "ger", "gl", "gla", "gle", "glg", "glv", "gom", "gre", "gsw", "gu", "guj", "guz",
    "gv", "ha", "hau", "haw", "hbs", "he", "heb", "hi", "hin", "hr", "hrv", "hsb", "hu", "hun", "hy", "hye", "ia",
    "ibo", "ice", "id", "ie", "ig", "ii", "iii", "ile", "in", "ina", "ind", "is", "isl", "it", "ita", "iw", "ja", "jav",
    "jaw", "jgo", "ji", "jmc", "jpn", "jv", "jw", "ka", "kab", "kal", "kam", "kan", "kas", "kat", "kaz", "kde", "kea",
    "kgp", "khk", "khm", "khq", "ki", "kik", "kin", "kir", "kk", "kkj", "kl", "kln", "km", "kmr", "kn", "ko", "kok",
    "kor", "ks", "ksb", "ksf", "ksh", "ku", "kur", "kw", "kxv", "ky", "lag", "lao", "lav", "lb", "lg", "lij", "lin",
    "lit", "lkt", "lmo", "ln", "lo", "lrc", "lt", "ltz", "lu", "lub", "lug", "luo", "luy", "lv", "lvs", "mac", "mai",
    "mal", "mao", "mar", "mas", "may", "mer", "mfe", "mg", "mgh", "mgo", "mi", "mk", "mkd", "ml", "mlg", "mlt", "mn",
    "mni", "mo", "mol", "mon", "mr", "mri", "ms", "msa", "mt", "mua", "mup", "my", "mya", "mzn", "naq", "nb", "nd",
    "nde", "nds", "ne", "nep", "nl", "nld", "nmg", "nn", "nnh", "nno", "no", "nob", "nor", "npi", "nqo", "nso", "nus",
    "nyn", "oc", "oci", "om", "or", "ori", "orm", "ory", "os", "oss", "pa", "pan", "pbu", "pcm", "per", "pes", "pl",
    "plt", "pol", "por", "prg", "prp", "prs", "ps", "pt", "pus", "qu", "que", "quz", "raj", "rm", "rn", "ro", "rof",
    "roh", "ron", "ru", "rum", "run", "rus", "rw", "rwk", "sa", "sag", "sah", "san", "saq", "sat", "sbp", "sc", "scc",
    "scr", "sd", "se", "seh", "ses", "sg", "sh", "shi", "si", "sin", "sk", "sl", "slk", "slo", "slv", "sme", "smn",
    "sn", "sna", "snd", "so", "som", "sot", "spa", "spy", "sq", "sqi", "sr", "src", "srd", "srp", "st", "su", "sun",
    "sv", "sw", "swa", "swc", "swe", "swh", "syr", "szl", "ta", "tam", "tat", "te", "tel", "teo", "tg", "tgk", "tgl",
    "th", "tha", "ti", "tib", "tir", "tk", "tl", "tn", "tnf", "to", "tok", "ton", "tr", "tsn", "tt", "tuk", "tur",
    "twi", "twq", "tzm", "ug", "uig", "uk", "ukr", "ur", "urd", "uz", "uzb", "uzn", "vai", "vec", "vi", "vie", "vmw",
    "vun", "wae", "wel", "wo", "wol", "xh", "xho", "xnr", "xog", "yav", "ydd", "yi", "yid", "yo", "yor", "yrl", "yue",
    "za", "zgh", "zh", "zha", "zho", "zsm", "zu", "zul", "zyb",
];

fn alpha(s: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphabetic())
}

fn alphanum(s: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn is_language(s: &str) -> bool {
    alpha(s, 2, 3) || alpha(s, 5, 8)
}

fn is_script(s: &str) -> bool {
    alpha(s, 4, 4)
}

fn is_region(s: &str) -> bool {
    alpha(s, 2, 2) || (s.len() == 3 && s.bytes().all(|b| b.is_ascii_digit()))
}

fn is_variant(s: &str) -> bool {
    alphanum(s, 5, 8) || (s.len() == 4 && s.as_bytes()[0].is_ascii_digit() && alphanum(s, 4, 4))
}

/// Reads `language[-script][-region](-variant)*` from `tags[i..]`; the index after it, or `None` when malformed.
fn language_id(tags: &[&str], mut i: usize) -> Option<usize> {
    if !tags.get(i).is_some_and(|t| is_language(t)) {
        return None;
    }
    i += 1;
    if tags.get(i).is_some_and(|t| is_script(t)) {
        i += 1;
    }
    if tags.get(i).is_some_and(|t| is_region(t)) {
        i += 1;
    }
    let mut variants: Vec<&str> = Vec::new();
    while let Some(t) = tags.get(i).filter(|t| is_variant(t)) {
        if variants.contains(t) {
            return None;
        }
        variants.push(t);
        i += 1;
    }
    Some(i)
}

/// Reads one extension's subtags after its singleton at `tags[i - 1]`; the index after it, or `None`.
fn extension(singleton: &str, tags: &[&str], mut i: usize) -> Option<usize> {
    let start = i;
    match singleton {
        "u" => {
            while tags.get(i).is_some_and(|t| alphanum(t, 3, 8)) {
                i += 1;
            }
            while let Some(key) = tags.get(i).filter(|t| t.len() == 2) {
                let b = key.as_bytes();
                if !(b[0].is_ascii_alphanumeric() && b[1].is_ascii_alphabetic()) {
                    return None;
                }
                i += 1;
                while tags.get(i).is_some_and(|t| alphanum(t, 3, 8)) {
                    i += 1;
                }
            }
        }
        "t" => {
            if tags.get(i).is_some_and(|t| is_language(t)) {
                i = language_id(tags, i)?;
            }
            while let Some(key) = tags.get(i).filter(|t| t.len() == 2) {
                let b = key.as_bytes();
                if !(b[0].is_ascii_alphabetic() && b[1].is_ascii_digit()) {
                    return None;
                }
                i += 1;
                let values = i;
                while tags.get(i).is_some_and(|t| alphanum(t, 3, 8)) {
                    i += 1;
                }
                if i == values {
                    return None;
                }
            }
        }
        _ => {
            while tags.get(i).is_some_and(|t| alphanum(t, 2, 8)) {
                i += 1;
            }
        }
    }
    (i > start).then_some(i)
}

/// Whether `tag` is a well-formed locale id (ECMA-402 IsStructurallyValidLanguageTag).
fn well_formed(tag: &str) -> bool {
    let tags: Vec<&str> = tag.split('-').collect();
    let Some(mut i) = language_id(&tags, 0) else {
        return false;
    };
    let mut singletons: Vec<&str> = Vec::new();
    while let Some(&singleton) = tags.get(i) {
        if singleton == "x" {
            let rest = &tags[i + 1..];
            return !rest.is_empty() && rest.iter().all(|t| alphanum(t, 1, 8));
        }
        if singleton.len() != 1 || !alphanum(singleton, 1, 1) || singletons.contains(&singleton) {
            return false;
        }
        singletons.push(singleton);
        i = match extension(singleton, &tags, i + 1) {
            Some(next) => next,
            None => return false,
        };
    }
    true
}

/// Whether Node would format dates in locale `v` (`""` is the system's).
pub fn is_locale(v: &str) -> bool {
    if v.is_empty() {
        return true;
    }
    let tag = v.to_ascii_lowercase();
    if !v.is_ascii() || !well_formed(&tag) {
        return false;
    }
    let language = tag.split('-').next().unwrap_or("");
    LANGUAGES.binary_search(&language).is_ok()
}
