import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  codeBlockPlugin,
  codeMirrorPlugin, // <-- WICHTIG: Plugin für das Code-Parsing
  markdownShortcutPlugin,
  toolbarPlugin,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ListsToggle,
  UndoRedo,
  MDXEditorMethods,
  linkPlugin,
  CreateLink,
  CodeToggle,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useRef } from 'react'

interface EditorProps {
  markdown: string
  onChange: (markdown: string) => void
}

export default function MarkdownEditor({ markdown, onChange }: EditorProps) {
  const ref = useRef<MDXEditorMethods>(null)

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <MDXEditor
        ref={ref}
        markdown={markdown}
        onChange={onChange}
        className="prose dark:prose-invert max-w-full min-h-50"
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [4, 5, 6] }),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          markdownShortcutPlugin(),
          diffSourcePlugin({ viewMode: 'rich-text' }),

          // --- SPRACHEN FÜR CODE-BLÖCKE DEFINIEREN ---
          codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              txt: 'Plain Text',
              js: 'JavaScript',
              ts: 'TypeScript',
              python: 'Python',
              sql: 'SQL',
              html: 'HTML',
              css: 'CSS',
            },
          }),

          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <CodeToggle />
                <ListsToggle />
                <BlockTypeSelect />
                <CreateLink />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  )
}
