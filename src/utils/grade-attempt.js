import prisma from '../lib/prisma.js'
import { calculateScore } from './scoring.js'

// Build student answers array from TemporaryAnswer rows
function buildAnswersFromTemp(tempAnswers, items) {
  const byId = new Map(items.map(it => [it.id, it]))
  const answers = []
  for (const ta of tempAnswers) {
    const item = byId.get(ta.itemId)
    if (!item) continue
    if (item.type === 'MULTIPLE_CHOICE' || item.type === 'TRUE_FALSE_NOT_GIVEN') {
      if (ta.selectedKey) {
        answers.push({ itemId: ta.itemId, type: item.type, value: ta.selectedKey })
      }
    } else if (item.type === 'SHORT_ANSWER' || item.type === 'MATCHING_DROPDOWN') {
      const arr = Array.isArray(ta.textAnswer)
        ? ta.textAnswer
        : (ta.textAnswer == null ? [] : [String(ta.textAnswer)])
      answers.push({ itemId: ta.itemId, type: item.type, value: arr })
    }
  }
  return answers
}

// Grade answers consistent with submit route (per-blank)
function gradeAnswers(answers, items) {
  let correctCount = 0
  for (const item of items) {
    const studentAnswer = answers.find(a => a.itemId === item.id)
    if (!studentAnswer) continue

    if (item.type === 'MULTIPLE_CHOICE' || item.type === 'TRUE_FALSE_NOT_GIVEN') {
      const correctKey = String(item.correctKey || '').trim()
      const studentValue = String(studentAnswer.value || '').trim()
      if (correctKey === studentValue) correctCount += 1
      continue
    }

    if (item.type === 'SHORT_ANSWER' || item.type === 'MATCHING_DROPDOWN') {
      const norm = (s) => String(s ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      const rawCorrect = item.answerText
      const correctSlots = Array.isArray(rawCorrect)
        ? rawCorrect.map(slot => Array.isArray(slot) ? slot.map(norm) : [norm(slot)])
        : [[norm(rawCorrect)]]

      const studentSlotsRaw = Array.isArray(studentAnswer.value) ? studentAnswer.value : [studentAnswer.value]
      const studentSlots = studentSlotsRaw.map(norm)

      for (let i = 0; i < correctSlots.length; i++) {
        const acceptable = correctSlots[i]
        const studentVal = studentSlots[i] || ''
        const ok = acceptable.some(acc => acc === studentVal)
        if (ok) correctCount += 1
      }
      continue
    }
  }
  return { correctCount }
}

export async function gradeAttempt(attemptId, tx = prisma) {
  // Load attempt with package items
  const attempt = await tx.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      package: {
        include: {
          pages: {
            include: { questions: true },
            orderBy: { pageOrder: 'asc' }
          }
        }
      }
    }
  })
  if (!attempt || !attempt.package) {
    return { totalScore: 0, totalQuestions: 0, correctAnswers: 0 }
  }

  const items = attempt.package.pages.flatMap(p => p.questions)

  // Count totalQuestions per-blank
  let totalQuestions = 0
  for (const it of items) {
    if (it.type === 'SHORT_ANSWER' || it.type === 'MATCHING_DROPDOWN') {
      const blanks = (String(it.question || '').match(/\[[^\]]*\]/g) || []).length || 1
      totalQuestions += blanks
    } else {
      totalQuestions += 1
    }
  }

  // Load temporary answers
  const tempAnswers = await tx.temporaryAnswer.findMany({
    where: { attemptId },
    select: { itemId: true, selectedKey: true, textAnswer: true }
  })

  const answers = buildAnswersFromTemp(tempAnswers, items)
  const { correctCount } = gradeAnswers(answers, items)
  const totalScore = Math.round(calculateScore(correctCount, totalQuestions))

  return { totalScore, totalQuestions, correctAnswers: correctCount }
}
