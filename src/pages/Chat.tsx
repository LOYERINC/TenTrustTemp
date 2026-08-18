import { useState } from 'react';
import { MessageSquare, Plus, Globe, ShieldCheck, Send, Trash2, Mic, ArrowLeft, Home } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

export default function Chat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: 'TenTrust is a platform connecting verified tenants and landlords in Lagos. Do you want to learn more about renting, or finding properties?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState('English');

  const changeLanguage = async (newLanguage: string, msgIndex?: number) => {
    setLanguage(newLanguage);

    let targetIndex = msgIndex !== undefined ? msgIndex : -1;
    if (targetIndex === -1) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'ai') {
          targetIndex = i;
          break;
        }
      }
    }
    
    if (targetIndex === -1) return;

    const textToTranslate = messages[targetIndex].content;
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `Please translate the following text to ${newLanguage}. Only return the translation, no extra conversation: "${textToTranslate}"`, 
          context: `You are an expert translator.` 
        })
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid response from server: ${text.substring(0, 50)}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.reply) {
         setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[targetIndex] = { role: 'ai', content: data.reply };
            return newMsgs;
         });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage, 
          context: `We are TenTrust. A platform connecting verified tenants and landlords in Lagos. Note: The user prefers language: ${language}. Please reply in ${language}.` 
        })
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid response from server: ${text.substring(0, 50)}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.reply) {
         setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'ai', content: `Sorry, I'm having trouble connecting right now. ${error.message || ''}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const languages = ['English', 'Pidgin', 'Yoruba', 'Hausa', 'Igbo'];

  return (
    <div className="flex h-screen bg-white font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
           <Link to="/" className="flex items-center gap-2 font-heading font-bold text-xl text-slate-900">
             <ShieldCheck className="w-6 h-6 text-brand-600" />
             TenTrust
           </Link>
           <Link to="/" title="Back to Main Site" className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors">
             <Home className="w-4 h-4" />
           </Link>
        </div>
        <div className="p-4 space-y-2">
          <Link to="/" className="w-full flex items-center justify-start gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-brand-600" /> Back to Main Site
          </Link>
          <button onClick={() => setMessages([{ role: 'ai', content: 'How can I help you today?' }])} className="w-full flex items-center justify-start gap-2 bg-white border border-slate-200 shadow-xs rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors text-slate-700">
            <Plus className="w-4 h-4" /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 mt-2">
          <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Recents</p>
          <div className="space-y-1">
            <button className="w-full text-left px-3 py-2 text-sm text-slate-700 bg-slate-200/50 rounded-lg flex items-center gap-2 truncate font-medium">
               <MessageSquare className="w-4 h-4 shrink-0 text-slate-500" />
               Find apartments in Ikeja
            </button>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200">
           <button 
             onClick={() => setMessages([{ role: 'ai', content: 'How can I help you today?' }])}
             className="flex items-center justify-start gap-2 w-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
           >
             <Trash2 className="w-4 h-4" /> Clear chat history
           </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200">
              <ArrowLeft className="w-4 h-4 text-brand-600" /> Back to Main Site
            </Link>
            <div className="hidden sm:flex items-center gap-2 font-heading font-bold text-lg text-slate-800">
              <ShieldCheck className="w-5 h-5 text-brand-600" />
              TenTrust Intelligence
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400 hidden sm:block" />
            <div className="flex flex-wrap gap-1">
              {languages.map(lang => (
                <button 
                  key={lang}
                  onClick={() => changeLanguage(lang)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${language === lang ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>


        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:px-48 space-y-8 bg-white relative">
          {messages.map((msg, i) => (
             <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               {msg.role === 'ai' && (
                 <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                   <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-brand-600" />
                 </div>
               )}
               <div className={`max-w-[85%] md:max-w-2xl ${msg.role === 'user' ? 'bg-slate-100 px-5 py-3 rounded-2xl rounded-tr-sm' : 'pt-1 md:pt-2'}`}>
                  {msg.role === 'ai' && <div className="text-[10px] md:text-xs font-bold text-slate-400 mb-1 tracking-wider uppercase">TenTrust AI</div>}
                  <div className={`prose prose-slate prose-sm max-w-none ${msg.role === 'user' ? '!text-slate-900 font-medium' : ''}`}>
                    {msg.role === 'ai' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : msg.content}
                  </div>
                  {msg.role === 'ai' && i === messages.length - 1 && (
                     <div className="mt-4 flex flex-wrap gap-2">
                       {languages.map(lang => (
                         <button 
                           key={lang}
                           onClick={() => changeLanguage(lang, i)}
                           className={`px-3 py-1 text-[10px] md:text-xs font-medium rounded-full border transition-colors ${language === lang ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                         >
                           {lang}
                         </button>
                       ))}
                     </div>
                  )}
               </div>
             </div>
          ))}
          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                 <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-brand-600" />
              </div>
              <div className="pt-2">
                 <div className="text-xs font-bold text-slate-400 mb-2 tracking-wider uppercase">TenTrust AI</div>
                 <div className="flex gap-1.5 pt-1">
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 md:p-6 lg:px-48 bg-white border-t border-slate-100 shrink-0">
           <form onSubmit={sendMessage} className="relative max-w-3xl mx-auto flex items-end shadow-sm border border-slate-200 bg-slate-50 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-all focus-within:bg-white">
             <textarea 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Ask anything in ${language}...`}
                className="w-full max-h-32 p-4 pr-24 outline-none resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-500"
                rows={1}
             />
             <div className="absolute right-2 bottom-2 flex items-center gap-2">
               <button 
                 type="button"
                 title="Voice Input Placeholder"
                 className="p-2.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-full transition-colors shrink-0"
               >
                 <Mic className="w-4 h-4" />
               </button>
               <button 
                 type="submit"
                 disabled={!input.trim() || isLoading}
                 className="p-2.5 bg-slate-200 text-slate-500 rounded-full disabled:opacity-50 hover:bg-brand-600 hover:text-white transition-colors shrink-0"
               >
                 <Send className="w-4 h-4" />
               </button>
             </div>
           </form>
           <p className="text-center text-xs text-slate-400 mt-3 font-medium">TenTrust Intelligence can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
}
