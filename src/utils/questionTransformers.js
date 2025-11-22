export function transformQuestionsToDraft(pages) {
  return pages.map(pg => {
    const pageImage = pg.mediaAssets?.find(m => m.type === 'IMAGE')
    const pageAudio = pg.mediaAssets?.find(m => m.type === 'AUDIO')
    const storyMedia = {
      imageFile: null,
      audioFile: null,
      imageUrl: pageImage?.url || '',
      audioUrl: pageAudio?.url || ''
    }

    return {
      id: pg.id,
      storyMedia,
      storyText: pg.storyPassage || '',
      instructions: pg.instructions || '',
      multiple: true,
      questions: (pg.questions || []).map(it => {
        const itemImage = it.mediaAssets?.find(m => m.type === 'IMAGE')
        const itemAudio = it.mediaAssets?.find(m => m.type === 'AUDIO')
        const media = {
          imageFile: null,
          audioFile: null,
          imageUrl: itemImage?.url || '',
          audioUrl: itemAudio?.url || ''
        }

        if (it.type === 'MULTIPLE_CHOICE') {
          const options = Array.isArray(it.choicesJson)
            ? it.choicesJson.map(c => (typeof c === 'string' ? c : (c?.text || '')))
            : []
          const keyToIndex = { A: 0, B: 1, C: 2, D: 3 }
          const correctIndex = it.correctKey ? (keyToIndex[it.correctKey] ?? null) : null
          return { id: it.id, type: 'MCQ', text: it.question || '', options, correctIndex, media }
        }
        if (it.type === 'TRUE_FALSE_NOT_GIVEN') {
          const correctTFNG = it.correctKey || null
          return { id: it.id, type: 'TFNG', text: it.question || '', correctTFNG, media }
        }
        if (it.type === 'SHORT_ANSWER') {
          const shortTemplate = it.question || ''
          return { id: it.id, type: 'SHORT', shortTemplate, media }
        }
        if (it.type === 'MATCHING_DROPDOWN') {
          const matchingTemplate = it.question || ''
          const options = Array.isArray(it.choicesJson)
            ? it.choicesJson.map(c => (typeof c === 'string' ? c : (c?.text || '')))
            : []
          return { id: it.id, type: 'MATCHING', matchingTemplate, optionsText: options.join('\n'), media }
        }
        return { id: it.id, type: 'MCQ', text: '', options: [], correctIndex: null, media }
      })
    }
  })
}

export function buildContentSnapshot(pages) {
  return (pages || []).map(pg => ({
    storyText: pg.storyPassage || '',
    instructions: pg.instructions || '',
    storyMediaUrls: {
      imageUrl: (pg.mediaAssets || []).find(m => m.type === 'IMAGE')?.url || '',
      audioUrl: (pg.mediaAssets || []).find(m => m.type === 'AUDIO')?.url || '',
    },
    questions: (pg.questions || []).map(it => ({
      type: it.type === 'MULTIPLE_CHOICE'
        ? 'MCQ'
        : (it.type === 'TRUE_FALSE_NOT_GIVEN'
          ? 'TFNG'
          : (it.type === 'SHORT_ANSWER'
            ? 'SHORT'
            : (it.type === 'MATCHING_DROPDOWN' ? 'MATCHING' : 'MCQ'))),
      text: (it.type === 'SHORT_ANSWER' || it.type === 'MATCHING_DROPDOWN') ? undefined : (it.question || ''),
      options: Array.isArray(it.choicesJson) ? it.choicesJson.map(c => (typeof c === 'string' ? c : (c?.text || ''))) : undefined,
      correctIndex: (() => {
        if (it.type !== 'MULTIPLE_CHOICE') return undefined
        const idxMap = { A: 0, B: 1, C: 2, D: 3 }
        return it.correctKey ? (idxMap[it.correctKey] ?? null) : null
      })(),
      correctTFNG: it.type === 'TRUE_FALSE_NOT_GIVEN' ? (it.correctKey || null) : undefined,
      shortTemplate: it.type === 'SHORT_ANSWER' ? (it.question || '') : undefined,
      matchingTemplate: it.type === 'MATCHING_DROPDOWN' ? (it.question || '') : undefined,
      mediaUrls: {
        imageUrl: (it.mediaAssets || []).find(m => m.type === 'IMAGE')?.url || '',
        audioUrl: (it.mediaAssets || []).find(m => m.type === 'AUDIO')?.url || '',
      },
    }))
  }))
}

export function computeContentHash(pages) {
  try {
    const json = JSON.stringify(buildContentSnapshot(pages))
    let hash = 5381
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash) ^ json.charCodeAt(i)
    }
    return (hash >>> 0).toString(16)
  } catch {
    return String(Date.now())
  }
}
