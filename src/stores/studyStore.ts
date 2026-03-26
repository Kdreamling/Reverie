import { create } from 'zustand'
import { generateTestPrompt, type GenerateTestParams } from '../api/study'

interface StudyState {
  currentStep: 'setup' | 'test' | 'review'
  generatedPrompt: string | null
  answerPrompt: string | null
  testParams: GenerateTestParams | null

  generatePrompt: (params: GenerateTestParams) => Promise<string>
  setStep: (step: 'setup' | 'test' | 'review') => void
  reset: () => void
}

export const useStudyStore = create<StudyState>((set) => ({
  currentStep: 'setup',
  generatedPrompt: null,
  answerPrompt: null,
  testParams: null,

  generatePrompt: async (params) => {
    const { prompt } = await generateTestPrompt(params)
    set({ generatedPrompt: prompt, testParams: params, currentStep: 'test' })
    return prompt
  },

  setStep: (step) => set({ currentStep: step }),

  reset: () => set({
    currentStep: 'setup',
    generatedPrompt: null,
    answerPrompt: null,
    testParams: null,
  }),
}))
