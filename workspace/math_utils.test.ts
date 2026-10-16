import { add, multiply } from './math_utils';

if (add(2, 3) !== 5) throw new Error('add failed');
if (multiply(3, 4) !== 12) throw new Error('multiply failed');
console.log('Math utils test suite: PASSED');
