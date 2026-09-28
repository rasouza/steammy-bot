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

const GROUP_ICONS = {
  Features: '✨',
  'Bug Fixes': '🐛',
  'Performance Improvements': '⚡',
  Reverts: '🗑️',
  Documentation: '📖',
  'Code Refactoring': '♻️',
  Styles: '🎨',
  Tests: '✅',
  'Build System': '📦',
  'Continuous Integration': '⚙️',
  Chores: '🧹',
  'Other Changes': '📌',
};

const GROUP_ORDER = [
  'Features',
  'Bug Fixes',
  'Performance Improvements',
  'Reverts',
  'Documentation',
  'Code Refactoring',
  'Styles',
  'Tests',
  'Build System',
  'Continuous Integration',
  'Chores',
  'Other Changes',
];

function groupRank(title) {
  const index = GROUP_ORDER.indexOf(title);
  return index === -1 ? GROUP_ORDER.length : index;
}

const MAIN_TEMPLATE = `{{> header}}

{{#each commitGroups}}

{{#if title}}
### {{lookup @root.icons title}} {{title}}

{{/if}}
{{#each commits}}
{{> commit root=@root}}
{{/each}}

{{/each}}
{{> footer}}
{{#if linkCompare}}

{{#if repository}}
**Full Changelog**: {{#if @root.host}}{{@root.host}}/{{/if}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}/compare/{{previousTag}}...{{currentTag}}
{{else}}
{{#if @root.repoUrl}}
**Full Changelog**: {{@root.repoUrl}}/compare/{{previousTag}}...{{currentTag}}
{{/if}}
{{/if}}
{{/if}}
`;

const COMMIT_PARTIAL = `*{{#if scope}} **{{scope}}:**
{{~/if}} {{#if subject}}
  {{~subject}}
{{~else}}
  {{~header}}
{{~/if}}

{{~!-- commit link --}} {{#if @root.linkReferences~}}
  ([{{shortHash}}](
  {{~#if @root.repository}}
    {{~#if @root.host}}
      {{~@root.host}}/
    {{~/if}}
    {{~#if @root.owner}}
      {{~@root.owner}}/
    {{~/if}}
    {{~@root.repository}}
  {{~else}}
    {{~@root.repoUrl}}
  {{~/if~}}
  /{{@root.commit}}/{{hash}}))
{{~else}}
  {{~shortHash}}
{{~/if}}

{{~!-- commit references --}}
{{~#if references~}}
  , closes
  {{~#each references}} {{#if @root.linkReferences~}}
    [
    {{~#if this.owner}}
      {{~this.owner}}/
    {{~/if}}
    {{~this.repository}}#{{this.issue}}](
    {{~#if @root.repository}}
      {{~#if @root.host}}
        {{~@root.host}}/
      {{~/if}}
      {{~#if this.repository}}
        {{~#if this.owner}}
          {{~this.owner}}/
        {{~/if}}
        {{~this.repository}}
      {{~else}}
        {{~#if @root.owner}}
          {{~@root.owner}}/
        {{~/if}}
          {{~@root.repository}}
        {{~/if}}
    {{~else}}
      {{~@root.repoUrl}}
    {{~/if}}/
    {{~@root.issue}}/{{this.issue}})
  {{~else}}
    {{~#if this.owner}}
      {{~this.owner}}/
    {{~/if}}
    {{~this.repository}}#{{this.issue}}
  {{~/if}}{{/each}}
{{~/if}}

`;

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
    title: '⚠️ BREAKING CHANGES',
  }));

  const section = Object.prototype.hasOwnProperty.call(SECTIONS, commit.type)
    ? SECTIONS[commit.type]
    : undefined;
  const type =
    section || (commit.revert ? 'Reverts' : 'Other Changes');

  const scope = commit.scope === '*' ? '' : commit.scope;
  const shortHash =
    typeof commit.hash === 'string'
      ? commit.hash.substring(0, 7)
      : commit.shortHash;

  let subject = commit.subject;
  if (typeof subject !== 'string') {
    subject = commit.header;
  }

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
      mainTemplate: MAIN_TEMPLATE,
      commitPartial: COMMIT_PARTIAL,
      transform,
      groupBy: 'type',
      commitGroupsSort: (a, b) =>
        groupRank(a.title) - groupRank(b.title) ||
        String(a.title).localeCompare(String(b.title)),
      commitsSort: ['scope', 'subject'],
      noteGroupsSort: 'title',
      finalizeContext: (context) => ({ ...context, icons: GROUP_ICONS }),
    },
  };
}
