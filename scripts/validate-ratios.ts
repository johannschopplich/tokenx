// Measures each heuristic bucket against o200k on small, chat-sized
// inputs – the scale where per-segment rounding bias shows first
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base'
import { estimateTokenCount } from '../src/index.ts'

const BUCKETS: Record<string, string[]> = {
  'ja (kana 1.35)': [
    'こんにちは、元気ですか？',
    'ありがとうございました。',
    '今日は天気がいいですね。',
    'カタカナのテキストです。',
    '私は学生です。',
    '東京タワーへ行きましょう。',
    'すみません、駅はどこですか？',
    'これはペンです。',
  ],
  'zh (1 per hanzi)': [
    '你好，世界！',
    '今天天气很好。',
    '我喜欢学习中文。',
    '人工智能正在改变世界。',
    '请问洗手间在哪里？',
    '谢谢你的帮助。',
  ],
  'de (2.6)': [
    'Schönes Wetter heute, oder?',
    'Ich hätte gerne ein Stück Kuchen.',
    'Die Universität ist für ihre Forschung berühmt.',
    'Können wir das Meeting auf morgen verschieben?',
    'Über den Dächern der Stadt geht die Sonne unter.',
  ],
  'ru (4)': [
    'Привет, как дела?',
    'Сегодня хорошая погода.',
    'Я изучаю русский язык.',
    'Можем ли мы перенести встречу на завтра?',
    'Спасибо за помощь!',
  ],
  'fr/es (3)': [
    'Je voudrais un café et un croissant.',
    'On se retrouve à la gare demain matin.',
    '¿Cómo estás? Mañana será otro día.',
    'El niño pequeño juega en el jardín.',
  ],
  'slavic latin (2.5)': [
    'Dziękuję bardzo, do zobaczenia jutro.',
    'Czy możemy przełożyć spotkanie na jutro?',
    'Děkuji, přeji hezký den.',
    'Nashledanou, uvidíme se zítra večer.',
  ],
  'el (2.75)': [
    'Καλημέρα, τι κάνεις σήμερα;',
    'Ευχαριστώ πολύ για τη βοήθεια.',
    'Θα τα πούμε αύριο το πρωί.',
  ],
  'emoji (0.75)': [
    '😀😀😀',
    '👍',
    '🏀🔥😱',
    'Great job! 🎉🎉',
    'See you soon 😀🍕🎉',
  ],
  'numeric (3 digits per token)': [
    '12345 67890',
    '2026-07-27 09:30:00',
    'Order #48291 shipped, tracking 9405511899223197428490',
  ],
  'en chat (default 6)': [
    'Hey, are you coming to the meeting later?',
    'Sounds good, see you at 5!',
    'Can you send me the report by tomorrow morning?',
    'Thanks for the quick turnaround on this!',
  ],
  'code/url (default 6)': [
    'const total = items.reduce((sum, item) => sum + item.price, 0)',
    'https://example.com/path/to/resource?query=1',
    'SELECT id, name FROM users WHERE active = true;',
  ],
}

for (const [bucket, texts] of Object.entries(BUCKETS)) {
  let deviationSum = 0
  console.log(`\n### ${bucket}`)
  for (const text of texts) {
    const actual = countTokens(text)
    const estimated = estimateTokenCount(text)
    const deviation = ((estimated - actual) / actual) * 100
    deviationSum += deviation
    const label = text.length > 44 ? `${text.slice(0, 41)}...` : text
    console.log(`  ${String(actual).padStart(3)} -> ${String(estimated).padStart(3)}  ${deviation >= 0 ? '+' : ''}${deviation.toFixed(1).padStart(5)}%  ${label}`)
  }
  console.log(`  mean signed deviation: ${(deviationSum / texts.length).toFixed(1)}%`)
}
