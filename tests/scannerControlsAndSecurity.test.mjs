import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeImageUriInput } from '../utils/securityValidators.js';

describe('Cycle 12 — OWASP Local Image URI Guard & Memoized Scanner Step Controls (TDD)', () => {
  it('allows legitimate local camera/document URIs and blocks remote SSRF/XSS/traversal URIs', () => {
    // URIs locais legítimas do Expo Camera / FileSystem
    assert.equal(
      sanitizeImageUriInput('file:///data/user/0/com.ygtrz.ArmarioDigital/files/armario_images/item_1.jpg'),
      'file:///data/user/0/com.ygtrz.ArmarioDigital/files/armario_images/item_1.jpg'
    );
    assert.equal(
      sanitizeImageUriInput('content://media/external/images/media/1024'),
      'content://media/external/images/media/1024'
    );

    // Bloqueia esquemas remotos (SSRF / tracking beacons), javascript:, data: e Path Traversal (..)
    assert.equal(sanitizeImageUriInput('https://evil.example.com/beacon.jpg'), null);
    assert.equal(sanitizeImageUriInput('http://169.254.169.254/latest/meta-data'), null);
    assert.equal(sanitizeImageUriInput('javascript:alert(1)'), null);
    assert.equal(sanitizeImageUriInput('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(sanitizeImageUriInput('file:///data/user/0/../../etc/passwd'), null);
    assert.equal(sanitizeImageUriInput(''), null);
    assert.equal(sanitizeImageUriInput(null), null);
  });

  it('modularizes QuantityStepperControl and SpaceSelectorRow with React.memo and tabular-nums', () => {
    const baseDir = 'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital';
    const qtySource = fs.readFileSync(
      path.resolve(baseDir, 'components/QuantityStepperControl.js'),
      'utf8'
    );
    const spaceSelectorSource = fs.readFileSync(
      path.resolve(baseDir, 'components/SpaceSelectorRow.js'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.resolve(baseDir, 'App.js'), 'utf8');

    assert.ok(
      qtySource.includes('memo(') && qtySource.includes('tabular-nums'),
      'QuantityStepperControl.js must use React.memo and tabular-nums'
    );
    assert.ok(
      spaceSelectorSource.includes('memo(') &&
        spaceSelectorSource.includes('formatSpaceHierarchyName'),
      'SpaceSelectorRow.js must use React.memo and export formatSpaceHierarchyName'
    );
    assert.ok(
      appSource.includes('QuantityStepperControl') &&
        appSource.includes('SpaceSelectorRow') &&
        appSource.includes('sanitizeImageUriInput'),
      'App.js must integrate QuantityStepperControl, SpaceSelectorRow, and sanitizeImageUriInput'
    );
  });
});
