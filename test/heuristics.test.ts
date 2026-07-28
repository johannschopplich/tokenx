import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { describe, expect, it } from 'vitest'
import { estimateTokenCount } from '../src/index'

/**
 * A group of inputs that all exercise one estimation rule. Snapshots record
 * where that rule currently lands, so retuning a ratio produces a reviewable
 * diff rather than a pass or a fail.
 */
interface HeuristicBucket {
  /** Sentence-length inputs – the scale where per-segment rounding bias shows first */
  short?: string[]
  /** Paragraph-length inputs, where that same rounding bias amortizes away */
  medium?: string[]
  /**
   * Set where the bucket records a gap rather than a rule that was fitted to
   * it, so the deviation bound below does not apply
   */
  documentsGap?: boolean
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

// Every language bucket is running text from an encyclopedia article on one
// subject, not sentences written for the rule under test: a sentence built to
// carry an accent in every word prices a language through a density its prose
// never reaches
const BUCKETS = {
  german: {
    short: [
      'Röst- und Mahlgrad variieren je nach Zubereitungsart.',
      'Je nach Sorte und Anbauort gibt es unterschiedliche Qualitätsstufen.',
      'Zudem interagiert Kaffee signifikant mit verschiedenen Medikamenten.',
      'Der Kaffeeanbau brachte Arabien eine Monopolrolle ein.',
      'In den deutschen Sprachraum war der Kaffee bereits vorher gelangt.',
    ],
    medium: [
      'Ursprünglich konnten sich nur gut situierte Bürger und Aristokraten das aromatische Getränk leisten. Von ärmeren Bevölkerungsschichten und in Krisenzeiten wurde der Kaffee durch kaffeeähnliche Getränke wie Muckefuck, Malzkaffee, Stragelkaffee oder Zichorie ersetzt. Der nur noch wenig verbreitete Ausdruck „echter Bohnenkaffee“ entstand zur Abgrenzung gegenüber ebenfalls als Kaffee bezeichneten Ersatzprodukten.',
    ],
  },
  romance: {
    short: [
      'Les caféiers sont des arbustes des régions tropicales du genre Coffea, de la famille des Rubiacées.',
      'La consommation de café s\'étendit à l\'Égypte.',
      'Les pamphlets et libelles sont distribués dans les cafés.',
      'Dependiendo de la receta hay diversas formas de prepararlo.',
      'Tienen hojas persistentes y opuestas y bajo un poco de sombra crecen mejor.',
      'Produce un café fino y aromático, y necesita un clima fresco.',
    ],
    medium: [
      'Le café est une boisson énergisante psychotrope stimulante, obtenue à partir des graines torréfiées de diverses variétés de caféiers, des arbustes du genre Coffea. C\'est l\'une des trois boissons contenant de la caféine les plus consommées dans le monde, avec le thé et le maté.',
      'El café es una bebida que se obtiene mediante el percolado de agua caliente a través de los granos tostados y molidos de los frutos de la planta del café (cafeto); es altamente estimulante por su contenido de cafeína, una sustancia psicoactiva. Es uno de los productos más comercializados a nivel mundial, además de estar entre las tres bebidas más consumidas por el ser humano (junto con el agua y el té).',
    ],
  },
  // Polish only. Czech shares í, á, é and ú with the romance config, which is
  // checked first, so Czech words carrying no other accent price at 4.5 – see
  // the `czechShadowed` bucket. Mixing the two would blur the 2.5 this measures
  slavicLatin: {
    short: [
      'Jedna z najpopularniejszych używek na świecie i główne źródło kofeiny.',
      'Nazwa kawy pochodzi prawdopodobnie od arabskiego kahwa.',
      'Nazwa może wywodzić się od znanego z uprawy kawy regionu Kaffa w Etiopii.',
      'Wraz z ekspansją arabską zwyczaj picia kawy rozpowszechnił się na całym Bliskim Wschodzie.',
      'Początkowo budził on wiele nieufności, czy wręcz niechęci.',
    ],
    medium: [
      'Kawa – napój sporządzany z palonych, a następnie zmielonych lub poddanych instantyzacji ziaren kawowca, zwykle podawany na gorąco. Pochodzi z Etiopii, w Europie pojawiła się około XVI wieku. Jedna z najpopularniejszych używek na świecie i główne źródło kofeiny.',
    ],
  },
  czechShadowed: {
    short: [
      'Označují se tak i samotná semena, případně semena rozemletá na prášek.',
      'Především se káva pije pro své povzbuzující účinky.',
      'Je také velmi oblíbeným nápojem při setkávání lidí a je často podávána po jídle.',
      'Nejčastěji se pije káva ze zrnek druhu arabika a robusta.',
      'Pravlastí kávovníku je africký kontinent, konkrétně Etiopie.',
    ],
    medium: [
      'Existují dva základní druhy kávovníků, které se odlišují růstem, svými nároky na pěstování i finální chutí kávy. Oblast, ve které kávovník roste, má rovněž vliv na chuť kávy. Kávovníky pěstované ve vyšších nadmořských výškách poskytují kávová zrna jemnější chuti a s nižším obsahem kofeinu.',
    ],
  },
  cyrillic: {
    short: [
      'После кофейное дерево было привезено на Аравийский полуостров.',
      'В XVI веке стал широко распространяться в Османской империи.',
      'Это послужило концом арабской монополии на выращивание кофе.',
      'Арабика — наиболее распространённый вид кофе.',
      'Робуста обычно считается менее изысканным сортом кофейного зерна.',
    ],
    medium: [
      'В России кофе появился при царе Алексее Михайловиче и считался средством от многих болезней, в том числе от мигрени. Тем не менее именно обычай пить кофе связывают с именем Петра I. Он, по утверждениям историков, насильно поил «горьким пойлом» приближённых. В 1703 году был открыт первый кофейный дом.',
    ],
  },
  greek: {
    short: [
      'Όταν ο καφές πρωτοήρθε στην Ευρώπη ήταν γνωστός ως «αραβικό κρασί».',
      'Η ιστορία είναι λίγο ασαφής ως προς το τι συνέβη μετά.',
      'Είναι ένα «εύρωστο» είδος με υψηλή παραγωγή ανά φυτό.',
      'Η πιο γνωστή επίδραση του καφέ αφορά στο κεντρικό νευρικό σύστημα.',
      'Για αυτό τον λόγο ο καφές συνήθως καταναλώνεται τις πρωινές ώρες ή κατά τη διάρκεια της εργασίας.',
    ],
    medium: [
      'Οι Ολλανδοί ήταν οι πρώτοι που κατάφεραν να πάρουν σπόρους καφέ και να τον καλλιεργήσουν αρχικά στις αποικίες τους στην Ινδονησία. Την ίδια εποχή μάλιστα το φυτό του καφέ πέρασε και στην Ινδία, όπου μετέφερε σπόρους λαθραία ο Μπάμπα Μπουντάν κρύβοντας τους στις πτυχές των ρούχων του επιστρέφοντας από τη Μέκκα.',
    ],
  },
  english: {
    short: [
      'Coffee is a beverage brewed from roasted ground coffee beans.',
      'It is usually served hot, although chilled or iced coffee is common.',
      'Green, unroasted coffee is traded as an agricultural commodity.',
      'The drink appears to be a relatively recent development.',
      'Accounts differ on the origin of the coffee plant before its appearance in Yemen.',
    ],
    medium: [
      'Coffee has become a vital cash crop for many developing countries. Over 100 million people in developing countries have become dependent on coffee as their primary source of income. It has become the primary export and economic backbone for African countries like Uganda, Burundi, Rwanda, and Ethiopia, as well as many Central American countries.',
    ],
  },
  japanese: {
    short: [
      'コーヒー中のカフェインなどの興奮作用から労働者には最適な嗜好品とされている。',
      '精製された生豆は生産国で集積され、選別・等級付けされてから消費国に輸出される。',
      '生豆は消費地においてコーヒー独特の香味を生み出すために焙煎される。',
      'だが、記録が残っていないだけでアラビアコーヒーの歴史はそれよりずっと古いと推測されている。',
      'コーヒー文化が広まるにつれ、抽出法が工夫され始めた。',
    ],
    medium: [
      '伝播ルートはエチオピア→イエメン→メッカ（アラビアコーヒー）→オスマントルコ帝国（トルココーヒー）→ヨーロッパ→世界中に広まったと推定されるがはっきりはしていない。各間の伝播には「直接伝わった」のか「記録が無いだけで、その間に何か中継があったのか」もはっきりしていない。アラビアコーヒーで最古記録はイエメンの修道院で15世紀半ばである。だが、記録が残っていないだけでアラビアコーヒーの歴史はそれよりずっと古いと推測されている。',
    ],
  },
  chinese: {
    short: [
      '采收的成熟咖啡果会经过剥离果肉的初步加工，再经过烘焙的工序，而成为能制作咖啡的咖啡豆。',
      '因此，公平贸易咖啡与有机咖啡是一个不断扩大的市场。',
      '但此故事截至1671年并没有得到任何记载，因此可能是杜撰的。',
      '研磨的方法产出的咖啡末比较均匀，在烹制的时候出味也比较一致。',
      '研磨的速度越慢，摩擦产生的热量越少，因而咖啡的香气不易流失。',
    ],
    medium: [
      '16世纪初，咖啡从也门的摩卡港传播到埃及，随后咖啡馆还出现在叙利亚阿勒颇，并于1554年在奥斯曼帝国首都伊斯坦布尔开业。1511年，由于也门麦加的宗教领袖认为咖啡具有刺激作用，便开始禁止穆斯林饮用咖啡，造成其余阿拉伯世界的苏丹和宗教领袖也相继效仿；其中两位奥斯曼帝国苏丹更是同样出于政治考量，而在1517年和1623年两度禁止咖啡。',
    ],
  },
  korean: {
    short: [
      '일반적으로 뜨겁게 제공되지만 차가운 아이스 커피가 일반적이다.',
      '16세기에 이 음료는 중동과 북아프리카의 나머지 지역으로 퍼져나갔고 나중에 유럽으로 퍼졌다.',
      '커피는 많은 사회에서 중요한 역할을 해왔다.',
      '그곳에서부터 커피는 이집트와 예멘으로 전파되었다.',
      '이집트와 예멘에서는 커피가 종교적 의식에 사용되기도 했다.',
    ],
    medium: [
      '커피는 이제 세계적인 상품이 되었지만 홍해 주변의 음식 전통과 밀접하게 연관되어 있는 오랜 역사를 가지고 있다. 현대 음료로서 커피를 마시는 것에 대한 가장 신뢰할 수 있는 증거는 15세기 중반 아라비아 남부의 현대 예멘 수피 사원에서 나타난다. 그곳에서 커피 씨앗은 현재 준비되는 방식과 유사한 방식으로 처음으로 로스팅되고 양조되었다. 커피 원두는 소말리아 해안 중개인을 통해 에티오피아고원의 예멘인이 조달하여 예멘에서 재배했다. 16세기에 이 음료는 중동과 북아프리카의 나머지 지역으로 퍼져나갔고 나중에 유럽으로 퍼졌다.',
    ],
  },
  // Arabic, Hindi, Thai, and Hebrew share one path – they match no language
  // config and fall through to `defaultCharsPerToken`. One bucket, because
  // four would measure the same branch four times. Translations of one
  // paragraph rather than running text: with no rule to misfit, holding the
  // content constant is what makes the four scripts comparable
  unconfigured: {
    documentsGap: true,
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
  // No ratio fits a punctuation run: o200k has single tokens for long repeats
  // of one character, so a 32-character rule costs one token, while `}]}},`
  // costs three. The shipped ratio is not fitted against this bucket but
  // against whole documents, where most punctuation merges into the word
  // token before it instead
  punctuationRuns: {
    documentsGap: true,
    short: [
      '----',
      '--------------------------------',
      '============================================',
      '......',
      '>>>>>>>',
      '}]}},',
      '?!?!?!',
      '</div></section>',
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
  // Line-broken text against its wrapped equivalent: a break after a word
  // buys a token of its own, so lists and chat logs cost more than a
  // paragraph carrying the same words
  lineBreaks: {
    medium: [
      '- Install the package\n- Run the CLI\n- Inspect the output\n- Report a bug\n',
      'alice: are we still on for the review?\nbob: yes, ten minutes\nalice: perfect\nbob: bringing the notes\n',
      'The estimate walks the text once, splitting it into\nsegments on whitespace and punctuation, and prices\neach segment with the first rule that matches it.\n',
      'name,plan,seats\nusr_29f84h,pro,12\nusr_71b2c9,team,4\nusr_04d8e1,free,1\n',
    ],
  },
} satisfies Record<string, HeuristicBucket>

describe('heuristic calibration', () => {
  describe('accented and non-Latin alphabets', () => {
    it('prices German text', () => {
      expect(measureBucket(BUCKETS.german)).toMatchInlineSnapshot(`
        "short   16 → 14   -12.5%  Röst- und Mahlgrad variieren je nach Zubereit…
        short   14 → 17   +21.4%  Je nach Sorte und Anbauort gibt es unterschie…
        short   14 → 12   -14.3%  Zudem interagiert Kaffee signifikant mit vers…
        short   13 → 10   -23.1%  Der Kaffeeanbau brachte Arabien eine Monopolr…
        short   13 → 13     0.0%  In den deutschen Sprachraum war der Kaffee be…
        medium  95 → 93    -2.1%  Ursprünglich konnten sich nur gut situierte B…
        mean               -5.1%
        mean |dev|         12.2%"
      `)
    })

    it('prices French and Spanish text', () => {
      expect(measureBucket(BUCKETS.romance)).toMatchInlineSnapshot(`
        "short   24 → 23    -4.2%  Les caféiers sont des arbustes des régions tr…
        short   14 → 11   -21.4%  La consommation de café s'étendit à l'Égypte.
        short   13 → 15   +15.4%  Les pamphlets et libelles sont distribués dan…
        short   12 → 13    +8.3%  Dependiendo de la receta hay diversas formas …
        short   18 → 16   -11.1%  Tienen hojas persistentes y opuestas y bajo u…
        short   14 → 15    +7.1%  Produce un café fino y aromático, y necesita …
        medium  69 → 65    -5.8%  Le café est une boisson énergisante psychotro…
        medium  93 → 95    +2.2%  El café es una bebida que se obtiene mediante…
        mean               -1.2%
        mean |dev|          9.4%"
      `)
    })

    it('prices Polish text', () => {
      expect(measureBucket(BUCKETS.slavicLatin)).toMatchInlineSnapshot(`
        "short   21 → 19    -9.5%  Jedna z najpopularniejszych używek na świecie…
        short   16 → 11   -31.3%  Nazwa kawy pochodzi prawdopodobnie od arabski…
        short   27 → 19   -29.6%  Nazwa może wywodzić się od znanego z uprawy k…
        short   31 → 27   -12.9%  Wraz z ekspansją arabską zwyczaj picia kawy r…
        short   23 → 22    -4.3%  Początkowo budził on wiele nieufności, czy wr…
        medium  81 → 73    -9.9%  Kawa – napój sporządzany z palonych, a następ…
        mean              -16.3%
        mean |dev|         16.3%"
      `)
    })

    it('prices Czech text, which the romance config shadows', () => {
      expect(measureBucket(BUCKETS.czechShadowed)).toMatchInlineSnapshot(`
        "short    25 →  18   -28.0%  Označují se tak i samotná semena, případně se…
        short    17 →  13   -23.5%  Především se káva pije pro své povzbuzující ú…
        short    26 →  22   -15.4%  Je také velmi oblíbeným nápojem při setkávání…
        short    22 →  14   -36.4%  Nejčastěji se pije káva ze zrnek druhu arabik…
        short    22 →  15   -31.8%  Pravlastí kávovníku je africký kontinent, kon…
        medium  101 →  80   -20.8%  Existují dva základní druhy kávovníků, které …
        mean                -26.0%
        mean |dev|           26.0%"
      `)
    })

    it('prices Russian text', () => {
      expect(measureBucket(BUCKETS.cyrillic)).toMatchInlineSnapshot(`
        "short   18 → 13   -27.8%  После кофейное дерево было привезено на Арави…
        short   16 → 14   -12.5%  В XVI веке стал широко распространяться в Осм…
        short   17 → 13   -23.5%  Это послужило концом арабской монополии на вы…
        short   11 → 11     0.0%  Арабика — наиболее распространённый вид кофе.
        short   19 → 13   -31.6%  Робуста обычно считается менее изысканным сор…
        medium  88 → 71   -19.3%  В России кофе появился при царе Алексее Михай…
        mean              -19.1%
        mean |dev|         19.1%"
      `)
    })

    it('prices Greek text', () => {
      expect(measureBucket(BUCKETS.greek)).toMatchInlineSnapshot(`
        "short    28 →  24   -14.3%  Όταν ο καφές πρωτοήρθε στην Ευρώπη ήταν γνωστ…
        short    18 →  20   +11.1%  Η ιστορία είναι λίγο ασαφής ως προς το τι συν…
        short    20 →  18   -10.0%  Είναι ένα «εύρωστο» είδος με υψηλή παραγωγή α…
        short    23 →  23     0.0%  Η πιο γνωστή επίδραση του καφέ αφορά στο κεντ…
        short    31 →  35   +12.9%  Για αυτό τον λόγο ο καφές συνήθως καταναλώνετ…
        medium  114 → 106    -7.0%  Οι Ολλανδοί ήταν οι πρώτοι που κατάφεραν να π…
        mean                 -1.2%
        mean |dev|            9.2%"
      `)
    })

    it('prices English text at the default ratio', () => {
      expect(measureBucket(BUCKETS.english)).toMatchInlineSnapshot(`
        "short   11 → 12    +9.1%  Coffee is a beverage brewed from roasted grou…
        short   14 → 15    +7.1%  It is usually served hot, although chilled or…
        short   13 → 14    +7.7%  Green, unroasted coffee is traded as an agric…
        short   10 → 12   +20.0%  The drink appears to be a relatively recent d…
        short   15 → 17   +13.3%  Accounts differ on the origin of the coffee p…
        medium  62 → 72   +16.1%  Coffee has become a vital cash crop for many …
        mean              +12.2%
        mean |dev|         12.2%"
      `)
    })
  })

  // eslint-disable-next-line test/prefer-lowercase-title
  describe('CJK scripts', () => {
    it('prices Japanese text', () => {
      expect(measureBucket(BUCKETS.japanese)).toMatchInlineSnapshot(`
        "short    33 →  30    -9.1%  コーヒー中のカフェインなどの興奮作用から労働者には最適な嗜好品とされている。
        short    33 →  32    -3.0%  精製された生豆は生産国で集積され、選別・等級付けされてから消費国に輸出される。
        short    32 →  26   -18.8%  生豆は消費地においてコーヒー独特の香味を生み出すために焙煎される。
        short    37 →  34    -8.1%  だが、記録が残っていないだけでアラビアコーヒーの歴史はそれよりずっと古いと推測されている。
        short    23 →  21    -8.7%  コーヒー文化が広まるにつれ、抽出法が工夫され始めた。
        medium  186 → 162   -12.9%  伝播ルートはエチオピア→イエメン→メッカ（アラビアコーヒー）→オスマントルコ帝国（トルココ…
        mean                -10.1%
        mean |dev|           10.1%"
      `)
    })

    it('prices Chinese text', () => {
      expect(measureBucket(BUCKETS.chinese)).toMatchInlineSnapshot(`
        "short    41 →  38    -7.3%  采收的成熟咖啡果会经过剥离果肉的初步加工，再经过烘焙的工序，而成为能制作咖啡的咖啡豆。
        short    20 →  22   +10.0%  因此，公平贸易咖啡与有机咖啡是一个不断扩大的市场。
        short    21 →  27   +28.6%  但此故事截至1671年并没有得到任何记载，因此可能是杜撰的。
        short    24 →  27   +12.5%  研磨的方法产出的咖啡末比较均匀，在烹制的时候出味也比较一致。
        short    29 →  27    -6.9%  研磨的速度越慢，摩擦产生的热量越少，因而咖啡的香气不易流失。
        medium  147 → 145    -1.4%  16世纪初，咖啡从也门的摩卡港传播到埃及，随后咖啡馆还出现在叙利亚阿勒颇，并于1554年在…
        mean                 +5.9%
        mean |dev|           11.1%"
      `)
    })

    it('prices Korean text', () => {
      expect(measureBucket(BUCKETS.korean)).toMatchInlineSnapshot(`
        "short    22 →  21    -4.5%  일반적으로 뜨겁게 제공되지만 차가운 아이스 커피가 일반적이다.
        short    36 →  30   -16.7%  16세기에 이 음료는 중동과 북아프리카의 나머지 지역으로 퍼져나갔고 나중에 유럽으…
        short    12 →  14   +16.7%  커피는 많은 사회에서 중요한 역할을 해왔다.
        short    19 →  17   -10.5%  그곳에서부터 커피는 이집트와 예멘으로 전파되었다.
        short    21 →  20    -4.8%  이집트와 예멘에서는 커피가 종교적 의식에 사용되기도 했다.
        medium  180 → 175    -2.8%  커피는 이제 세계적인 상품이 되었지만 홍해 주변의 음식 전통과 밀접하게 연관되어 …
        mean                 -3.8%
        mean |dev|            9.3%"
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
        "short   7 → 10   +42.9%  GPT-4o를 사용하는 방법
        short   5 →  6   +20.0%  React と Vue の比較
        short  10 → 10     0.0%  AI 技术在 2026 年的应用
        short   8 →  9   +12.5%  Der Build-Prozess läuft über Vite
        mean             +18.8%
        mean |dev|        18.8%"
      `)
    })
  })

  describe('structural segments', () => {
    // No bucket mean – the runs pull in both directions by construction, and
    // averaging them would hide the spread that makes the ratio unfittable
    it('prices punctuation runs', () => {
      expect(measureBucket(BUCKETS.punctuationRuns, { hasMean: false })).toMatchInlineSnapshot(`
        "short  1 → 1     0.0%  ----
        short  1 → 6  +500.0%  --------------------------------
        short  2 → 8  +300.0%  ============================================
        short  1 → 1     0.0%  ......
        short  1 → 2  +100.0%  >>>>>>>
        short  3 → 1   -66.7%  }]}},
        short  2 → 1   -50.0%  ?!?!?!
        short  5 → 5     0.0%  </div></section>"
      `)
    })

    it('prices line breaks against their wrapped equivalent', () => {
      expect(measureBucket(BUCKETS.lineBreaks)).toMatchInlineSnapshot(`
        "medium  20 → 20     0.0%  - Install the package\\n- Run the CLI\\n- Inspe…
        medium  27 → 28    +3.7%  alice: are we still on for the review?\\nbob: …
        medium  30 → 35   +16.7%  The estimate walks the text once, splitting i…
        medium  41 → 30   -26.8%  name,plan,seats\\nusr_29f84h,pro,12\\nusr_71b2c…
        mean               -1.6%
        mean |dev|         11.8%"
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
        short  29 → 24   -17.2%  {\\n  "id": "usr_29f84h",\\n  "plan": "pro",\\n …
        short  14 → 14     0.0%  {"ok":true,"error":null,"retryAfter":30}
        mean             -12.8%
        mean |dev|        12.8%"
      `)
    })

    it('prices Markdown documents', () => {
      expect(measureBucket(BUCKETS.markdown)).toMatchInlineSnapshot(`
        "medium  76 → 83    +9.2%  # Getting started\\n\\nInstall the package:\\n\\n…
        medium  93 → 95    +2.2%  ## Plugin ordering\\n\\nA Vite plugin can addit…
        medium  71 → 73    +2.8%  ### Conditional application\\n\\nBy default plu…
        mean               +4.7%
        mean |dev|          4.7%"
      `)
    })
  })

  it('keeps every fitted bucket within the mean absolute deviation bound', () => {
    const fittedBuckets: [string, HeuristicBucket][] = Object.entries(BUCKETS)
      .filter(([, bucket]) => !('documentsGap' in bucket && bucket.documentsGap))

    const runawayBuckets = fittedBuckets
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

/** The statistic the bucket bound is enforced on */
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
