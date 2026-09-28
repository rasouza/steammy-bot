const SECTIONS = {
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance Improvements',
  revert: 'Reverts',
  docs: 'Documentation',
  style: 'Styles',
  refactor: 'Code Refactoring',
  test: 'Tests',
  build: 'Build System',
  ci: 'Continuous Integration',
  chore: 'Chores',
};

const PARSER = {
  headerPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?: (.*)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
  breakingHeaderPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!: (.*)$/,
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  issuePrefixes: ['#'],
  referenceActions: [
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
  ],
  revertPattern: /^Revert\s"([\s\S]*)"\s*This reverts commit (\w*)\.?/,
  revertCorrespondence: ['header', 'hash'],
  fieldPattern: /^-(.*?)-$/,
};

function transform(commit, context) {
  const notes = (commit.notes || []).map((note) => ({
    ...note,
    title: 'BREAKING CHANGES',
  }));

  const section = Object.prototype.hasOwnProperty.call(SECTIONS, commit.type)
    ? SECTIONS[commit.type]
    : undefined;
  const type =
    section || (commit.revert ? 'Reverts' : commit.type || 'Other Changes');

  const scope = commit.scope === '*' ? '' : commit.scope;
  const shortHash =
    typeof commit.hash === 'string'
      ? commit.hash.substring(0, 7)
      : commit.shortHash;

  let subject = commit.subject;
  const issues = [];

  if (typeof subject === 'string') {
    let url = context.repository
      ? `${context.host}/${context.owner}/${context.repository}`
      : context.repoUrl;

    if (url) {
      url = `${url}/issues/`;
      subject = subject.replace(/#([0-9]+)/g, (_, issue) => {
        issues.push(issue);
        return `[#${issue}](${url}${issue})`;
      });
    }

    if (context.host) {
      subject = subject.replace(
        /`[^`]*`|\B@([a-z0-9](?:-?[a-z0-9/]){0,38})/g,
        (match, username) => {
          if (!username) {
            return match;
          }
          if (username.includes('/')) {
            return `@${username}`;
          }
          return `[@${username}](${context.host}/${username})`;
        },
      );
    }
  } else {
    subject = commit.header;
  }

  const references = (commit.references || []).filter(
    (reference) => !issues.includes(reference.issue),
  );

  return { notes, type, scope, shortHash, subject, references };
}

export default async function conventionalCommitsPreset() {
  return {
    parser: PARSER,
    writer: {
      transform,
      groupBy: 'type',
      commitGroupsSort: 'title',
      commitsSort: ['scope', 'subject'],
      noteGroupsSort: 'title',
    },
  };
}
