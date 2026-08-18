import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default function AIExplanationBox({ aiResult }) {
  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#111827',
      color: '#f3f4f6',
      borderRadius: '8px',
      fontSize: '14px',
      lineHeight: '1.6',
      overflowX: 'auto'
    }}>
      <h3 style={{ color: '#4ade80', marginTop: 0, marginBottom: '12px' }}>
        AI Explanation:
      </h3>
      
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {aiResult}
        </ReactMarkdown>
      </div>
    </div>
  );
}