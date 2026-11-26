// The Two Sum sample (tests/samples/two_sum_sorted_wrong_pointer.py) and its demo result.
// The traces are real recorded runs; the explanation and hints are example text, not AI output.

export const SAMPLE_QUESTION = 'Given a 1-indexed array of integers numbers that is already sorted in non-decreasing order, find two numbers that add up to target. Return their positions as [index1, index2].';

export const SAMPLE_CODE = `class Solution:
    def twoSum(self, numbers, target):
        left, right = 0, len(numbers) - 1
        while left < right:
            total = numbers[left] + numbers[right]
            if total == target:
                return [left + 1, right + 1]
            if total > target:
                left += 1
            else:
                right -= 1
        return []`;

export const SAMPLE_INPUT = 'numbers = [2,7,11,15], target = 9';
export const SAMPLE_EXPECTED = '[1,2]';

// The fix swaps lines 9 and 11.
const lines = SAMPLE_CODE.split('\n');
[lines[8], lines[10]] = [lines[10], lines[8]];
export const SAMPLE_CORRECT_CODE = lines.join('\n');

export const SAMPLE_HINTS = [
  { level: 1, text: 'When the total is too big, which pointer makes it smaller?', correctCode: null },
  { level: 2, text: 'Look at line 9 with the test above. At step 8, left moved from 0 to 1 while the total was 17, bigger than 9.', correctCode: null },
  { level: 3, text: 'The array is sorted, so moving right one place to the left gives a smaller number. Swap what happens on lines 9 and 11: total > target should move right, otherwise move left.', correctCode: null },
  { level: 4, text: 'Here is the corrected version. Only lines 9 and 11 change.', correctCode: SAMPLE_CORRECT_CODE },
];

export function sampleHint(level) {
  return SAMPLE_HINTS[Math.min(Math.max(level, 1), 4) - 1];
}

export const SAMPLE_BANNER = 'Sample result: the two runs are real recorded executions; the explanation and hints are example text written for the demo, not AI output.';

export function buildSampleSubmission(wrongTrace, correctTrace) {
  return {
    status: 'DONE',
    queuePosition: 0,
    error: null,
    result: {
      outcome: 'NORMAL',
      error: null,
      passed: false,
      actualOutput: [],
      expectedOutput: [1, 2],
      studentTrace: wrongTrace,
      correctTrace,
      firstDifference: { step: 8, line: 9, variable: 'left', yours: 1, correct: 0 },
      explanation: {
        what: 'Your code returned [] and the expected answer was [1, 2].',
        where: 'On line 9, left moved when the total was too big. At step 8 your left is 1 where the correct run still has 0.',
        why: 'In a sorted array, moving left forward picks a bigger number and makes the total grow. Moving right back is what makes the total smaller, so the pointers walked past the answer.',
      },
      mistakeType: 'wrong-pointer-moved',
      complexity: { time: 'O(n)', space: 'O(1)' },
      score: 72,
      hint: { level: 1, text: SAMPLE_HINTS[0].text },
    },
  };
}
