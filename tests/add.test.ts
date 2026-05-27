import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { add } from '../src/add.ts';

describe('add function', () => {
    it('should return the sum of two numbers', () => {
        const result = add(2, 3);
        assert.strictEqual(result, 5);
    });

    it('should handle negative numbers', () => {
        const result = add(-2, -3);
        assert.strictEqual(result, -5);
    });
    it('should handle zero', () => {
        const result = add(0, 5);
        assert.strictEqual(result, 5);
    });
});
