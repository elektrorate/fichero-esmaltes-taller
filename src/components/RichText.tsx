import ReactMarkdown from 'react-markdown';

export default function RichText({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>;
}