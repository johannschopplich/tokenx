import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { describe, expect, it } from 'vitest'
import { estimateTokenCount } from '../src/index'

/**
 * A group of inputs that all exercise one estimation rule. Snapshots record
 * where that rule currently lands, so retuning a ratio produces a reviewable
 * diff rather than a pass or a fail.
 */
interface HeuristicBucket {
  /** Chat-sized inputs – the scale where per-segment rounding bias shows first */
  short?: string[]
  /** Paragraph-length inputs, where that same rounding bias amortizes away */
  medium?: string[]
}

interface SampleMeasurement {
  tier: 'short' | 'medium'
  text: string
  referenceTokenCount: number
  estimatedTokenCount: number
  /** Positive when tokenx overestimates, negative when it underestimates */
  signedDeviation: number
}

/**
 * Mean absolute deviation a bucket may reach before the run fails outright.
 * Absolute, not signed: a bucket of +40% and -40% samples averages to zero
 * while being useless, and a signed bound would wave it through.
 */
const MAX_BUCKET_MEAN_ABSOLUTE_DEVIATION = 40

const SAMPLE_LABEL_WIDTH = 46

const BUCKETS = {
  german: {
    short: [
      'Schönes Wetter heute, oder?',
      'Ich hätte gerne ein Stück Kuchen.',
      'Die Universität ist für ihre Forschung berühmt.',
      'Können wir das Meeting auf morgen verschieben?',
      'Über den Dächern der Stadt geht die Sonne unter.',
    ],
    medium: [
      'Wir haben letzten Donnerstag den neuen Anmeldeprozess ausgerollt, und die Zahlen sehen schon jetzt besser aus als erwartet. Die Abschlussquote ist um etwa elf Prozent gestiegen, und Supportanfragen zum E-Mail-Schritt gibt es praktisch keine mehr. Ich würde es gern noch eine Woche laufen lassen, bevor wir etwas anderes ändern.',
    ],
  },
  romance: {
    short: [
      'Je voudrais un café et un croissant.',
      'On se retrouve à la gare demain matin.',
      '¿Cómo estás? Mañana será otro día.',
      'Los niños están jugando en el jardín.',
    ],
    medium: [
      'On a déployé le nouveau parcours d\'inscription jeudi dernier, et les chiffres sont déjà meilleurs que prévu. Le taux de finalisation a augmenté d\'environ onze pour cent, et les tickets support sur l\'étape e-mail ont pratiquement disparu. J\'aimerais qu\'on laisse tourner encore une semaine avant de toucher à autre chose.',
      'Lanzamos el nuevo proceso de registro el jueves pasado y los números ya se ven mejor de lo esperado. La tasa de finalización subió alrededor de un once por ciento y los tickets de soporte sobre el paso del email prácticamente desaparecieron. Me gustaría dejarlo así una semana más antes de tocar otra cosa.',
    ],
  },
  // Polish only. Czech shares í, á, é and ú with the romance config, which is
  // checked first, so Czech words carrying no other accent price at 3.0 – see
  // the `czechShadowed` bucket. Mixing the two would blur the 2.5 this measures
  slavicLatin: {
    short: [
      'Dziękuję bardzo, do zobaczenia jutro.',
      'Czy możemy przełożyć spotkanie na jutro?',
      'Wrócę później, muszę jeszcze skończyć raport.',
      'Życzę miłego weekendu i do usłyszenia.',
      'Gdzie znajdę najbliższą stację kolejową?',
    ],
    medium: [
      'Nowy proces rejestracji wdrożyliśmy w zeszły czwartek i wyniki już teraz wyglądają lepiej, niż się spodziewaliśmy. Odsetek ukończonych rejestracji wzrósł o jakieś jedenaście procent, a zgłoszeń do supportu dotyczących kroku z adresem e-mail praktycznie nie ma. Chciałbym zostawić to jeszcze na tydzień, zanim zmienimy cokolwiek innego.',
    ],
  },
  czechShadowed: {
    short: [
      'Děkuji, přeji hezký den.',
      'Na shledanou, uvidíme se zítra večer.',
      'Podíl dokončených registrací vzrostl.',
      'Jedenáct procent je lepší než nic.',
    ],
    medium: [
      'Nový registrační proces jsme nasadili minulý čtvrtek a čísla už teď vypadají lépe, než jsme čekali. Podíl dokončených registrací vzrostl přibližně o jedenáct procent a dotazy na podporu ohledně kroku s e-mailem prakticky zmizely. Rád bych to nechal běžet ještě týden, než budeme měnit něco dalšího.',
    ],
  },
  cyrillic: {
    short: [
      'Привет, как дела?',
      'Сегодня хорошая погода.',
      'Я изучаю русский язык.',
      'Можем ли мы перенести встречу на завтра?',
      'Спасибо за помощь!',
    ],
    medium: [
      'Новый процесс регистрации мы выкатили в прошлый четверг, и цифры уже выглядят лучше, чем мы ожидали. Доля завершённых регистраций выросла примерно на одиннадцать процентов, а обращения в поддержку по шагу с вводом почты практически исчезли. Хотел бы оставить всё как есть ещё на неделю, прежде чем менять что-то ещё.',
    ],
  },
  greek: {
    short: [
      'Καλημέρα, τι κάνεις σήμερα;',
      'Ευχαριστώ πολύ για τη βοήθεια.',
      'Θα τα πούμε αύριο το πρωί.',
    ],
    medium: [
      'Ανεβάσαμε τη νέα διαδικασία εγγραφής την περασμένη Πέμπτη και τα νούμερα δείχνουν ήδη καλύτερα από ό,τι περιμέναμε. Το ποσοστό ολοκλήρωσης ανέβηκε περίπου έντεκα τοις εκατό και τα αιτήματα υποστήριξης για το βήμα με το email έχουν σχεδόν σταματήσει. Θα ήθελα να το αφήσουμε άλλη μία εβδομάδα πριν αλλάξουμε κάτι άλλο.',
    ],
  },
  english: {
    short: [
      'Hey, are you coming to the meeting later?',
      'Sounds good, see you at 5!',
      'Can you send me the report by tomorrow morning?',
      'Thanks for the quick turnaround on this!',
    ],
    medium: [
      'We shipped the new onboarding flow last Thursday and the numbers already look better than expected. Sign-up completion is up about eleven percent, and support tickets about the email step have basically stopped. I would like to leave it running for another week before we touch anything else.',
      'Vite strives to offer established patterns out of the box, so before creating a new plugin make sure that you check the Features guide to see if your need is covered. Also review available community plugins, both in the form of a compatible Rollup plugin and Vite specific plugins.',
    ],
  },
  japanese: {
    short: [
      'お疲れさまです、今いいですか？',
      'ありがとうございました。',
      '今日は天気がいいですね。',
      'ミーティング、リスケできますか？',
      '今向かってます。',
      '東京タワー、行きませんか？',
      'すみません、駅はどこですか？',
      'だいじょうぶです。',
      '来週の予定を共有しておきます。',
      '資料は明日の朝までに送ります。',
      '確認しましたので、進めてください。',
      'この設定はデフォルトのままで大丈夫です。',
    ],
    medium: [
      '先週木曜に新しい登録フローをリリースしたのですが、数字は思っていたより良さそうです。登録完了率は一割ちょっと上がって、メール周りの問い合わせもほぼ来なくなりました。ほかに手を入れる前に、もう一週間このまま様子を見たいと思っています。',
      'プラグインを作成する際には、vite.config.js にインラインで記述できます。そのために新しいパッケージを作成する必要はありません。あるプラグインが自分のプロジェクトで役に立ったことがわかったら、エコシステムにいる他の人を助けるために共有することを検討してください。',
    ],
  },
  chinese: {
    short: [
      '你好，在吗？',
      '今天天气不错啊。',
      '我最近在学中文。',
      '人工智能这块变化太快了。',
      '请问洗手间在哪里？',
      '谢谢你帮忙，辛苦了。',
      '这个方案我觉得可行。',
      '会议改到下周三下午。',
    ],
    medium: [
      '新的注册流程上周四已经上线了，数据看起来比预期还要好。注册完成率提高了一成多，邮箱验证那一步的工单基本上没有了。我想再观察一周，再考虑动其他地方。',
      '人工智能应用中较为知名的例子包括高级网络搜索引擎、聊天机器人、虚拟助手、自动驾驶汽车，以及在策略游戏（如国际象棋和围棋）中的对弈和分析。自2020年代以来，生成式人工智能已被广泛用于根据文本提示生成图像、音频和视频。',
    ],
  },
  korean: {
    short: [
      '안녕하세요, 오늘 회의 몇 시죠?',
      '네, 알겠습니다. 감사합니다!',
      '내일 아침까지 보고서 보내주실 수 있나요?',
      '빨리 처리해 주셔서 감사합니다.',
      '점심 뭐 드실래요?',
      '이번 주 금요일까지 마무리하겠습니다.',
      '설정은 기본값 그대로 두셔도 됩니다.',
    ],
    medium: [
      '지난주 목요일에 새 가입 플로우를 배포했는데 수치가 예상보다 잘 나오고 있습니다. 가입 완료율이 눈에 띄게 올랐고, 이메일 인증 단계 문의는 거의 안 들어옵니다. 다른 걸 건드리기 전에 일주일 정도 더 지켜보려고 합니다.',
      '플러그인을 만들 때는 vite.config.js 안에 인라인으로 작성할 수 있습니다. 이를 위해 새 패키지를 만들 필요는 없습니다. 어떤 플러그인이 여러 프로젝트에서 유용하다는 것을 확인했다면, 생태계의 다른 사람들을 돕기 위해 공유하는 것을 고려해 보세요.',
    ],
  },
  // Arabic, Hindi, Thai, and Hebrew share one path – they match no language
  // config and fall through to `defaultCharsPerToken`. One bucket, because
  // four would measure the same branch four times
  unconfigured: {
    short: [
      'مرحبا، هل الاجتماع اليوم الساعة الثالثة؟',
      'नमस्ते, आज मीटिंग तीन बजे है क्या?',
      'สวัสดีครับ ประชุมวันนี้บ่ายสามใช่ไหมครับ',
      'היי, הפגישה היום בשלוש?',
    ],
    medium: [
      'أطلقنا عملية التسجيل الجديدة يوم الخميس الماضي والأرقام تبدو أفضل مما توقعنا. ارتفعت نسبة إتمام التسجيل بنحو أحد عشر في المئة، وتكاد طلبات الدعم المتعلقة بخطوة البريد الإلكتروني تختفي تماما. أفضّل أن نتركها أسبوعا آخر قبل أن نغير أي شيء.',
      'नई साइन-अप प्रोसेस हमने पिछले गुरुवार को लॉन्च की थी और आंकड़े उम्मीद से बेहतर दिख रहे हैं। रजिस्ट्रेशन पूरा करने की दर करीब ग्यारह प्रतिशत बढ़ी है और ईमेल वाले स्टेप से जुड़े सपोर्ट टिकट लगभग खत्म हो गए हैं। कुछ और बदलने से पहले मैं इसे एक हफ़्ता और चलने देना चाहूँगा।',
      'เราปล่อยขั้นตอนการสมัครแบบใหม่เมื่อวันพฤหัสบดีที่แล้ว และตัวเลขดูดีกว่าที่คาดไว้ อัตราการสมัครสำเร็จเพิ่มขึ้นราวสิบเอ็ดเปอร์เซ็นต์ ส่วนเคสซัพพอร์ตเรื่องขั้นตอนอีเมลแทบไม่มีแล้ว ผมขอปล่อยไว้อีกสักสัปดาห์ก่อนจะไปแก้อย่างอื่นครับ',
      'השקנו את תהליך ההרשמה החדש ביום חמישי שעבר והמספרים נראים טובים יותר ממה שציפינו. שיעור השלמת ההרשמה עלה בכאחד עשר אחוז, ופניות התמיכה בנוגע לשלב האימייל כמעט נעלמו. הייתי רוצה להשאיר את זה עוד שבוע לפני שנשנה עוד משהו.',
    ],
  },
  // Vocabulary probes rather than prose: words drawn from the corpus itself,
  // spread across the frequency range, so a length band can be read on its own.
  // `Math.ceil` charges a second token from seven characters on, while o200k
  // merges most words of that length into one
  wordsSevenToTen: {
    short: [
      'plugins because started prepend Western impression returns exported politician promises Instead beginning',
      'squeezed permanent leverage balloon promise wedging sharply keyword generic replace loaders avoiding',
    ],
  },
  wordsElevenPlus: {
    short: [
      'environment viteMetadata experimental IndexHtmlTransformResult Pictographic conventions ResolvedConfig writeBundle',
      'plagiaristic impressionability neighbourhood dissimilarity aggressively irrelevantly entertained instructions',
    ],
  },
  // Runs of four characters and up are the only inputs that reach the
  // punctuation rule – shorter ones exit at the short-token threshold first
  punctuationRuns: {
    short: [
      '----',
      '======',
      '***',
      '...',
      '/* */',
      '<!-- -->',
      '=>',
      '::::',
    ],
  },
  mixedScript: {
    short: [
      'GPT-4o를 사용하는 방법',
      'React と Vue の比較',
      'AI 技术在 2026 年的应用',
      'Der Build-Prozess läuft über Vite',
    ],
  },
  emoji: {
    short: [
      '😀😀😀',
      '👍',
      '🏀🔥😱',
      'Great job! 🎉🎉',
      'See you soon 😀🍕🎉',
      '🎉',
      '😀😀😀😀😀😀😀😀',
      'Ship it 🚀',
    ],
  },
  numeric: {
    short: [
      '12345 67890',
      '2026-07-27 09:30:00',
      'Order #48291 shipped, tracking 9405511899223197428490',
    ],
  },
  code: {
    short: [
      'const total = items.reduce((sum, item) => sum + item.price, 0)',
      'https://example.com/path/to/resource?query=1',
      'SELECT id, name FROM users WHERE active = true;',
    ],
  },
  json: {
    short: [
      '{"id":"usr_29f84h","plan":"pro","seats":12}',
      '{\n  "id": "usr_29f84h",\n  "plan": "pro",\n  "seats": 12\n}',
      '{"ok":true,"error":null,"retryAfter":30}',
    ],
  },
  markdown: {
    medium: [
      '# Getting started\n\nInstall the package:\n\n```bash\nnpm install tokenx\n```\n\n## Usage\n\n- Call `estimateTokenCount(text)` to get an estimate.\n- Pass `options` to tune the heuristics.\n- See the [API reference](https://example.com/api) for details.\n\n> **Note**\n> Estimates are calibrated against `o200k_base`.\n',
      '## Plugin ordering\n\nA Vite plugin can additionally specify an `enforce` property to adjust its application order. The resolved plugins are applied in the following order:\n\n1. Alias\n2. User plugins with `enforce: \'pre\'`\n3. Vite core plugins\n4. User plugins without enforce value\n\n| Hook | Timing |\n| --- | --- |\n| `config` | before resolution |\n| `buildStart` | on build start |\n',
      '### Conditional application\n\nBy default plugins are invoked for both serve and build. In cases where a plugin needs to be conditionally applied only during serve or build, use the `apply` property:\n\n```js\nexport default defineConfig({\n  plugins: [\n    {\n      ...typescript2(),\n      apply: \'build\',\n    },\n  ],\n})\n```\n',
    ],
  },
} satisfies Record<string, HeuristicBucket>

describe('heuristic calibration', () => {
  describe('accented and non-Latin alphabets', () => {
    it('prices German text', () => {
      expect(measureBucket(BUCKETS.german)).toMatchInlineSnapshot(`
        "short    8 →  8     0.0%  Schönes Wetter heute, oder?
        short    7 →  9   +28.6%  Ich hätte gerne ein Stück Kuchen.
        short   10 → 14   +40.0%  Die Universität ist für ihre Forschung berühm…
        short   11 → 10    -9.1%  Können wir das Meeting auf morgen verschieben?
        short   12 → 13    +8.3%  Über den Dächern der Stadt geht die Sonne unt…
        medium  68 → 70    +2.9%  Wir haben letzten Donnerstag den neuen Anmeld…
        mean              +11.8%
        mean |dev|         14.8%"
      `)
    })

    it('prices French and Spanish text', () => {
      expect(measureBucket(BUCKETS.romance)).toMatchInlineSnapshot(`
        "short    9 → 11   +22.2%  Je voudrais un café et un croissant.
        short    9 → 10   +11.1%  On se retrouve à la gare demain matin.
        short   10 → 12   +20.0%  ¿Cómo estás? Mañana será otro día.
        short    8 → 11   +37.5%  Los niños están jugando en el jardín.
        medium  66 → 71    +7.6%  On a déployé le nouveau parcours d'inscriptio…
        medium  63 → 72   +14.3%  Lanzamos el nuevo proceso de registro el juev…
        mean              +18.8%
        mean |dev|         18.8%"
      `)
    })

    it('prices Polish text', () => {
      expect(measureBucket(BUCKETS.slavicLatin)).toMatchInlineSnapshot(`
        "short    13 →  11   -15.4%  Dziękuję bardzo, do zobaczenia jutro.
        short    11 →  13   +18.2%  Czy możemy przełożyć spotkanie na jutro?
        short    15 →  14    -6.7%  Wrócę później, muszę jeszcze skończyć raport.
        short    14 →  14     0.0%  Życzę miłego weekendu i do usłyszenia.
        short    14 →  16   +14.3%  Gdzie znajdę najbliższą stację kolejową?
        medium  106 → 103    -2.8%  Nowy proces rejestracji wdrożyliśmy w zeszły …
        mean                 +1.3%
        mean |dev|            9.6%"
      `)
    })

    it('prices Czech text, which the romance config shadows', () => {
      expect(measureBucket(BUCKETS.czechShadowed)).toMatchInlineSnapshot(`
        "short   12 → 10   -16.7%  Děkuji, přeji hezký den.
        short   16 → 12   -25.0%  Na shledanou, uvidíme se zítra večer.
        short   11 → 12    +9.1%  Podíl dokončených registrací vzrostl.
        short   10 → 11   +10.0%  Jedenáct procent je lepší než nic.
        medium  92 → 91    -1.1%  Nový registrační proces jsme nasadili minulý …
        mean               -4.7%
        mean |dev|         12.4%"
      `)
    })

    it('prices Russian text', () => {
      expect(measureBucket(BUCKETS.cyrillic)).toMatchInlineSnapshot(`
        "short    6 →  5   -16.7%  Привет, как дела?
        short    6 →  6     0.0%  Сегодня хорошая погода.
        short    6 →  6     0.0%  Я изучаю русский язык.
        short   12 → 10   -16.7%  Можем ли мы перенести встречу на завтра?
        short    4 →  5   +25.0%  Спасибо за помощь!
        medium  76 → 76     0.0%  Новый процесс регистрации мы выкатили в прошл…
        mean               -1.4%
        mean |dev|          9.7%"
      `)
    })

    it('prices Greek text', () => {
      expect(measureBucket(BUCKETS.greek)).toMatchInlineSnapshot(`
        "short    10 →  10     0.0%  Καλημέρα, τι κάνεις σήμερα;
        short    12 →  11    -8.3%  Ευχαριστώ πολύ για τη βοήθεια.
        short    11 →  10    -9.1%  Θα τα πούμε αύριο το πρωί.
        medium  106 → 108    +1.9%  Ανεβάσαμε τη νέα διαδικασία εγγραφής την περα…
        mean                 -3.9%
        mean |dev|            4.8%"
      `)
    })

    it('prices English text at the default ratio', () => {
      expect(measureBucket(BUCKETS.english)).toMatchInlineSnapshot(`
        "short   10 → 10     0.0%  Hey, are you coming to the meeting later?
        short    9 →  8   -11.1%  Sounds good, see you at 5!
        short   10 → 11   +10.0%  Can you send me the report by tomorrow mornin…
        short    8 →  9   +12.5%  Thanks for the quick turnaround on this!
        medium  53 → 60   +13.2%  We shipped the new onboarding flow last Thurs…
        medium  56 → 61    +8.9%  Vite strives to offer established patterns ou…
        mean               +5.6%
        mean |dev|          9.3%"
      `)
    })
  })

  // eslint-disable-next-line test/prefer-lowercase-title
  describe('CJK scripts', () => {
    it('prices Japanese text', () => {
      expect(measureBucket(BUCKETS.japanese)).toMatchInlineSnapshot(`
        "short   12 → 10   -16.7%  お疲れさまです、今いいですか？
        short    2 →  8  +300.0%  ありがとうございました。
        short    7 →  8   +14.3%  今日は天気がいいですね。
        short   10 → 11   +10.0%  ミーティング、リスケできますか？
        short    6 →  6     0.0%  今向かってます。
        short   10 →  9   -10.0%  東京タワー、行きませんか？
        short   11 →  9   -18.2%  すみません、駅はどこですか？
        short    7 →  6   -14.3%  だいじょうぶです。
        short   11 → 10    -9.1%  来週の予定を共有しておきます。
        short   10 → 10     0.0%  資料は明日の朝までに送ります。
        short    9 → 11   +22.2%  確認しましたので、進めてください。
        short   13 → 13     0.0%  この設定はデフォルトのままで大丈夫です。
        medium  80 → 75    -6.3%  先週木曜に新しい登録フローをリリースしたのですが、数字は思っていたより良さそうです。登録完…
        medium  85 → 85     0.0%  プラグインを作成する際には、vite.config.js にインラインで記述できます。その…
        mean              +19.4%
        mean |dev|         30.1%"
      `)
    })

    it('prices Chinese text', () => {
      expect(measureBucket(BUCKETS.chinese)).toMatchInlineSnapshot(`
        "short    4 →  4     0.0%  你好，在吗？
        short    6 →  6     0.0%  今天天气不错啊。
        short    6 →  6     0.0%  我最近在学中文。
        short    9 →  8   -11.1%  人工智能这块变化太快了。
        short    7 →  6   -14.3%  请问洗手间在哪里？
        short    9 →  7   -22.2%  谢谢你帮忙，辛苦了。
        short    7 →  7     0.0%  这个方案我觉得可行。
        short    8 →  7   -12.5%  会议改到下周三下午。
        medium  51 → 49    -3.9%  新的注册流程上周四已经上线了，数据看起来比预期还要好。注册完成率提高了一成多，邮箱验证那一…
        medium  76 → 72    -5.3%  人工智能应用中较为知名的例子包括高级网络搜索引擎、聊天机器人、虚拟助手、自动驾驶汽车，以及…
        mean               -6.9%
        mean |dev|          6.9%"
      `)
    })

    it('prices Korean text', () => {
      expect(measureBucket(BUCKETS.korean)).toMatchInlineSnapshot(`
        "short   10 → 12   +20.0%  안녕하세요, 오늘 회의 몇 시죠?
        short    7 → 10   +42.9%  네, 알겠습니다. 감사합니다!
        short   14 → 14     0.0%  내일 아침까지 보고서 보내주실 수 있나요?
        short   10 → 10     0.0%  빨리 처리해 주셔서 감사합니다.
        short    8 →  7   -12.5%  점심 뭐 드실래요?
        short   11 → 12    +9.1%  이번 주 금요일까지 마무리하겠습니다.
        short   11 → 11     0.0%  설정은 기본값 그대로 두셔도 됩니다.
        medium  68 → 72    +5.9%  지난주 목요일에 새 가입 플로우를 배포했는데 수치가 예상보다 잘 나오고 있습니다.…
        medium  67 → 82   +22.4%  플러그인을 만들 때는 vite.config.js 안에 인라인으로 작성할 수 있습니…
        mean               +9.7%
        mean |dev|         12.5%"
      `)
    })
  })

  describe('scripts without a language config', () => {
    // No bucket mean – the four scripts drift in different directions and
    // averaging them would hide exactly the spread worth seeing
    it('prices Arabic, Hindi, Thai, and Hebrew text', () => {
      expect(measureBucket(BUCKETS.unconfigured, { hasMean: false })).toMatchInlineSnapshot(`
        "short    9 →  8   -11.1%  مرحبا، هل الاجتماع اليوم الساعة الثالثة؟
        short   14 →  9   -35.7%  नमस्ते, आज मीटिंग तीन बजे है क्या?
        short   16 →  7   -56.3%  สวัสดีครับ ประชุมวันนี้บ่ายสามใช่ไหมครับ
        short    9 →  6   -33.3%  היי, הפגישה היום בשלוש?
        medium  66 → 46   -30.3%  أطلقنا عملية التسجيل الجديدة يوم الخميس الماض…
        medium  79 → 58   -26.6%  नई साइन-अप प्रोसेस हमने पिछले गुरुवार को लॉन्…
        medium  87 → 33   -62.1%  เราปล่อยขั้นตอนการสมัครแบบใหม่เมื่อวันพฤหัสบด…
        medium  82 → 44   -46.3%  השקנו את תהליך ההרשמה החדש ביום חמישי שעבר וה…"
      `)
    })
  })

  describe('word length bands at the default ratio', () => {
    it('prices words of seven to ten characters', () => {
      expect(measureBucket(BUCKETS.wordsSevenToTen)).toMatchInlineSnapshot(`
        "short  12 → 17   +41.7%  plugins because started prepend Western impre…
        short  16 → 16     0.0%  squeezed permanent leverage balloon promise w…
        mean             +20.8%
        mean |dev|        20.8%"
      `)
    })

    it('prices words of eleven characters and up', () => {
      expect(measureBucket(BUCKETS.wordsElevenPlus)).toMatchInlineSnapshot(`
        "short  17 → 18    +5.9%  environment viteMetadata experimental IndexHt…
        short  16 → 17    +6.3%  plagiaristic impressionability neighbourhood …
        mean              +6.1%
        mean |dev|         6.1%"
      `)
    })

    it('prices text mixing scripts within a line', () => {
      expect(measureBucket(BUCKETS.mixedScript)).toMatchInlineSnapshot(`
        "short   7 →  9   +28.6%  GPT-4o를 사용하는 방법
        short   5 →  5     0.0%  React と Vue の比較
        short  10 →  8   -20.0%  AI 技术在 2026 年的应用
        short   8 →  9   +12.5%  Der Build-Prozess läuft über Vite
        mean              +5.3%
        mean |dev|        15.3%"
      `)
    })
  })

  describe('structural segments', () => {
    it('prices punctuation runs', () => {
      expect(measureBucket(BUCKETS.punctuationRuns)).toMatchInlineSnapshot(`
        "short  1 → 1     0.0%  ----
        short  1 → 1     0.0%  ======
        short  1 → 1     0.0%  ***
        short  1 → 1     0.0%  ...
        short  2 → 2     0.0%  /* */
        short  2 → 2     0.0%  <!-- -->
        short  1 → 1     0.0%  =>
        short  1 → 1     0.0%  ::::
        mean             0.0%
        mean |dev|       0.0%"
      `)
    })

    it('prices emoji runs', () => {
      expect(measureBucket(BUCKETS.emoji)).toMatchInlineSnapshot(`
        "short  3 → 4   +33.3%  😀😀😀
        short  1 → 2  +100.0%  👍
        short  5 → 4   -20.0%  🏀🔥😱
        short  7 → 6   -14.3%  Great job! 🎉🎉
        short  8 → 7   -12.5%  See you soon 😀🍕🎉
        short  2 → 2     0.0%  🎉
        short  8 → 9   +12.5%  😀😀😀😀😀😀😀😀
        short  4 → 4     0.0%  Ship it 🚀
        mean           +12.4%
        mean |dev|      24.1%"
      `)
    })

    it('prices digit runs', () => {
      expect(measureBucket(BUCKETS.numeric)).toMatchInlineSnapshot(`
        "short   5 →  4   -20.0%  12345 67890
        short  12 → 11    -8.3%  2026-07-27 09:30:00
        short  16 → 16     0.0%  Order #48291 shipped, tracking 94055118992231…
        mean              -9.4%
        mean |dev|         9.4%"
      `)
    })

    it('prices code and URLs', () => {
      expect(measureBucket(BUCKETS.code)).toMatchInlineSnapshot(`
        "short  19 → 20    +5.3%  const total = items.reduce((sum, item) => sum…
        short  11 → 16   +45.5%  https://example.com/path/to/resource?query=1
        short  11 → 11     0.0%  SELECT id, name FROM users WHERE active = tru…
        mean             +16.9%
        mean |dev|        16.9%"
      `)
    })
  })

  describe('document formats', () => {
    it('prices JSON payloads', () => {
      expect(measureBucket(BUCKETS.json)).toMatchInlineSnapshot(`
        "short  19 → 15   -21.1%  {"id":"usr_29f84h","plan":"pro","seats":12}
        short  29 → 23   -20.7%  {\\n  "id": "usr_29f84h",\\n  "plan": "pro",\\n …
        short  14 → 14     0.0%  {"ok":true,"error":null,"retryAfter":30}
        mean             -13.9%
        mean |dev|        13.9%"
      `)
    })

    it('prices Markdown documents', () => {
      expect(measureBucket(BUCKETS.markdown)).toMatchInlineSnapshot(`
        "medium  76 → 81    +6.6%  # Getting started\\n\\nInstall the package:\\n\\n…
        medium  93 → 93     0.0%  ## Plugin ordering\\n\\nA Vite plugin can addit…
        medium  71 → 72    +1.4%  ### Conditional application\\n\\nBy default plu…
        mean               +2.7%
        mean |dev|          2.7%"
      `)
    })
  })

  it('keeps every bucket within the mean absolute deviation bound', () => {
    const runawayBuckets = Object.entries(BUCKETS)
      .filter(([, bucket]) => meanAbsoluteDeviation(measureSamples(bucket)) >= MAX_BUCKET_MEAN_ABSOLUTE_DEVIATION)
      .map(([name]) => name)

    expect(runawayBuckets).toEqual([])
  })
})

function measureSamples(bucket: HeuristicBucket): SampleMeasurement[] {
  const tiers = [['short', bucket.short], ['medium', bucket.medium]] as const

  return tiers.flatMap(([tier, texts]) => (texts ?? []).map((text) => {
    const referenceTokenCount = encode(text).length
    const estimatedTokenCount = estimateTokenCount(text)

    return {
      tier,
      text,
      referenceTokenCount,
      estimatedTokenCount,
      signedDeviation: ((estimatedTokenCount - referenceTokenCount) / referenceTokenCount) * 100,
    }
  }))
}

function meanSignedDeviation(measurements: SampleMeasurement[]): number {
  return measurements.reduce((sum, measurement) => sum + measurement.signedDeviation, 0) / measurements.length
}

/**
 * The statistic that decides whether a bucket is calibrated. The signed mean
 * alone hides a bucket whose samples cancel out, so both are reported and only
 * this one is bounded.
 */
function meanAbsoluteDeviation(measurements: SampleMeasurement[]): number {
  return measurements.reduce((sum, measurement) => sum + Math.abs(measurement.signedDeviation), 0) / measurements.length
}

/**
 * Renders a bucket as one row per sample. The reference column is the
 * independent oracle – a table of deviations alone would agree with the
 * estimator by construction and could never disagree with it.
 */
function measureBucket(bucket: HeuristicBucket, { hasMean = true } = {}): string {
  const measurements = measureSamples(bucket)
  const tierWidth = Math.max(...measurements.map(measurement => measurement.tier.length))
  const countWidth = Math.max(...measurements.map(measurement => Math.max(
    String(measurement.referenceTokenCount).length,
    String(measurement.estimatedTokenCount).length,
  )))
  // Everything left of the percentage: the tier column, two spaces, and the
  // `reference → estimate` pair. The summary rows span it in one piece
  const leadWidth = Math.max(tierWidth + 2 + countWidth * 2 + ' → '.length, 'mean |dev|'.length)

  const rows = measurements.map((measurement) => {
    const tier = measurement.tier.padEnd(tierWidth)
    const counts = `${String(measurement.referenceTokenCount).padStart(countWidth)} → ${String(measurement.estimatedTokenCount).padStart(countWidth)}`

    return `${tier}  ${counts}  ${formatSignedPercent(measurement.signedDeviation)}  ${truncate(measurement.text)}`
  })

  if (!hasMean)
    return rows.join('\n')

  return [
    ...rows,
    `${'mean'.padEnd(leadWidth)}  ${formatSignedPercent(meanSignedDeviation(measurements))}`,
    `${'mean |dev|'.padEnd(leadWidth)}  ${`${meanAbsoluteDeviation(measurements).toFixed(1)}%`.padStart(7)}`,
  ].join('\n')
}

function formatSignedPercent(signedDeviation: number): string {
  const magnitude = Math.abs(signedDeviation).toFixed(1)
  const sign = Number(magnitude) === 0 ? ' ' : signedDeviation > 0 ? '+' : '-'

  return `${sign}${magnitude}%`.padStart(7)
}

function truncate(text: string): string {
  // Code points, not UTF-16 units – slicing by `length` would cut an emoji
  // sample in half and leave a lone surrogate in the snapshot
  const characters = Array.from(text.replace(/\n/g, '\\n'))
  if (characters.length <= SAMPLE_LABEL_WIDTH)
    return characters.join('')

  return `${characters.slice(0, SAMPLE_LABEL_WIDTH - 1).join('')}…`
}
