// Test script for text-transcript-parser
const { parseTextTranscript, calculateConfidence, validateTranscript } = require('./src/lib/text-transcript-parser.ts');

console.log('=== Test Case 1: Space-separated ===');
const test1 = `Fall 2023/2024
CS101 Programming 1 A 3
MATH101 Calculus 1 B+ 3`;
const parsed1 = parseTextTranscript(test1);
console.log('Parsed successfully:', parsed1 ? 'Yes' : 'No');
if (parsed1) {
  const conf1 = calculateConfidence(parsed1);
  const val1 = validateTranscript(parsed1);
  console.log('Confidence score:', conf1.score);
  console.log('Validation result:', val1.valid ? 'Pass' : 'Fail');
  console.log('Validation errors:', val1.errors);
}

console.log('\n=== Test Case 2: Pipe-separated ===');
const test2 = `CS101 | Programming 1 | A | 3
MATH101 | Calculus 1 | B+ | 3`;
const parsed2 = parseTextTranscript(test2);
console.log('Parsed successfully:', parsed2 ? 'Yes' : 'No');
if (parsed2) {
  const conf2 = calculateConfidence(parsed2);
  const val2 = validateTranscript(parsed2);
  console.log('Confidence score:', conf2.score);
  console.log('Validation result:', val2.valid ? 'Pass' : 'Fail');
  console.log('Validation errors:', val2.errors);
}

console.log('\n=== Test Case 3: Comma-separated ===');
const test3 = `CS101, Programming 1, A, 3
MATH101, Calculus 1, B+, 3`;
const parsed3 = parseTextTranscript(test3);
console.log('Parsed successfully:', parsed3 ? 'Yes' : 'No');
if (parsed3) {
  const conf3 = calculateConfidence(parsed3);
  const val3 = validateTranscript(parsed3);
  console.log('Confidence score:', conf3.score);
  console.log('Validation result:', val3.valid ? 'Pass' : 'Fail');
  console.log('Validation errors:', val3.errors);
}

console.log('\n=== Test Case 4: PDF-like structure ===');
const test4 = `Fall  2023/2024
CS101   Programming 1   A   3
MATH101   Calculus 1   B+   3`;
const parsed4 = parseTextTranscript(test4);
console.log('Parsed successfully:', parsed4 ? 'Yes' : 'No');
if (parsed4) {
  const conf4 = calculateConfidence(parsed4);
  const val4 = validateTranscript(parsed4);
  console.log('Confidence score:', conf4.score);
  console.log('Validation result:', val4.valid ? 'Pass' : 'Fail');
  console.log('Validation errors:', val4.errors);
}

console.log('\n=== Test Case 5: Invalid text ===');
const test5 = `hello world
this is a test`;
const parsed5 = parseTextTranscript(test5);
console.log('Parsed successfully:', parsed5 ? 'Yes' : 'No');
if (parsed5) {
  const conf5 = calculateConfidence(parsed5);
  const val5 = validateTranscript(parsed5);
  console.log('Confidence score:', conf5.score);
  console.log('Validation result:', val5.valid ? 'Pass' : 'Fail');
  console.log('Validation errors:', val5.errors);
} else {
  console.log('Parser returned null');
}
