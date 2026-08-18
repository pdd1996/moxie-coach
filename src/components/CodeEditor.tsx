import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { useTheme } from '@/lib/theme'

interface CodeEditorProps {
  value: string
  onChange: (v: string) => void
  lang: 'python' | 'javascript'
  height?: string
}

export function CodeEditor({ value, onChange, lang, height = '360px' }: CodeEditorProps) {
  const { theme } = useTheme()
  return (
    <CodeMirror
      value={value}
      height={height}
      theme={theme === 'dark' ? 'dark' : 'light'}
      extensions={[lang === 'python' ? python() : javascript()]}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
    />
  )
}
