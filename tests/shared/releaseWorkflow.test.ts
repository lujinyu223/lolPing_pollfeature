import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The release workflow cannot run here, so these checks keep its ordering from regressing: installed apps read latest.yml from the
// newest *published* release, so the release has to stay a draft until all installers and the update files are uploaded.
const workflow = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8').replace(/\r\n/g, '\n');

/** The text of one top-level job. */
function job(name: string): string {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const start = jobs.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const next = jobs.slice(start + 1).search(/\n {2}[a-z]+:\n/);
  return next < 0 ? jobs.slice(start) : jobs.slice(start, start + 1 + next);
}

describe('release workflow', () => {
  it('sets the existing published release to draft before any platform builds', () => {
    expect(workflow).toMatch(/on:\n {2}release:\n {4}types: \[published\]/);
    expect(job('release')).toContain('gh release edit "$GITHUB_REF_NAME" --draft');
    for (const name of ['windows', 'mac', 'linux']) {
      expect(job(name), name).toMatch(/needs: release\n/);
    }
  });

  it('uploads the Windows installer and update files, Mac disk image and Linux packages', () => {
    const win = job('windows');
    expect(win).toContain('"release/lolPing-Setup-${GITHUB_REF_NAME#v}.exe"');
    expect(win).toContain('"release/latest.yml"');
    expect(win).toContain('"release/lolPing-Setup-${GITHUB_REF_NAME#v}.exe.blockmap"');
    expect(win).toContain('--clobber');
    expect(job('mac')).toContain('release/lolPing-${GITHUB_REF_NAME#v}-arm64.dmg');
    expect(job('linux')).toContain('gh release upload "$GITHUB_REF_NAME" release/*.AppImage release/*.deb --clobber');
  });

  it('publishes the draft in a last job that waits for all platform jobs', () => {
    const publish = job('publish');
    expect(publish).toMatch(/needs: \[windows, mac, linux\]/);
    expect(publish).toContain('gh release edit "$GITHUB_REF_NAME" --draft=false');
    expect(publish).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/); // no checkout in this job, so gh needs to be told the repository
  });

  it('leaves no git credentials behind in the platform jobs (gh uses GH_TOKEN, and nothing there pushes)', () => {
    for (const name of ['windows', 'mac', 'linux']) {
      const text = job(name);
      expect(text, name).toMatch(/actions\/checkout@v7\n\s+with:\n\s+persist-credentials: false/);
      expect(text, name).not.toMatch(/git (push|commit|tag)/);
      expect(text, name).toContain('GH_TOKEN: ${{ github.token }}');
    }
  });

  it('never publishes from the platform jobs', () => {
    for (const name of ['windows', 'mac', 'linux']) {
      expect(job(name), name).not.toContain('--draft=false');
    }
  });
});
