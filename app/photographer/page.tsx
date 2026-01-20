'use client';

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// 👇 請確認後端網址
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

// 👇 設定你的密碼 (簡單的前端驗證)
const ADMIN_PASSWORD = "CDGphoto"; 

interface Photo { id: number; url: string; originalUrl?: string; status: string; }

export default function PhotographerPage() {
  // 🔐 登入狀態管理
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 📸 相簿狀態管理
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');

  // ----------------------------------------------------
  // 1. 登入邏輯
  // ----------------------------------------------------
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos(); // 登入成功才撈照片
    } else {
      setErrorMsg('密碼錯誤，請重試');
      setPasswordInput('');
    }
  };

  // ----------------------------------------------------
  // 2. 照片管理邏輯
  // ----------------------------------------------------
  const loadAllPhotos = () => {
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPhotos(data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 即時監聽新照片
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        setPhotos(prev => {
            if (prev.some(p => p.id === newPhoto.id)) return prev;
            return [newPhoto, ...prev];
        });
    });
    // 即時監聽刪除
    socket.on('photo_deleted', (id: number) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    });

    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); };
  }, [isAuthenticated]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    for (let i = 0; i < e.target.files.length; i++) {
        const formData = new FormData();
        formData.append('photo', e.target.files[i]);
        await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }).catch(console.error);
    }
    setUploading(false);
    loadAllPhotos();
    e.target.value = ''; 
  };

  const executeDelete = async () => {
    if (deleteTargetId) {
        await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        setDeleteTargetId(null);
    }
  };

  // ----------------------------------------------------
  // 🎨 渲染：鎖定畫面 (還沒登入)
  // ----------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">攝影師後台</h2>
          <p className="text-slate-400 text-sm mb-6">請輸入密碼以進行管理</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setErrorMsg(''); }}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white focus:border-blue-500 focus:outline-none transition"
              autoFocus
            />
            {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
            
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg shadow-blue-900/50">
              解鎖進入
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 🎨 渲染：管理介面 (已登入)
  // ----------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-950 p-6 md:p-8 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="bg-blue-600 px-2 py-0.5 rounded text-sm align-middle">ADMIN</span>
              攝影師工作台
            </h1>
            <p className="text-slate-400 text-sm mt-1">共 {photos.length} 張照片</p>
          </div>

          <div className="flex gap-4">
             {/* 視角切換 */}
             <div className="flex bg-slate-800 p-1 rounded-lg">
                <button onClick={() => setViewMode('original')} className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode==='original'?'bg-slate-600 text-white':'text-slate-400'}`}>原圖</button>
                <button onClick={() => setViewMode('framed')} className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode==='framed'?'bg-blue-600 text-white':'text-slate-400'}`}>合成</button>
            </div>

            {/* 上傳按鈕 */}
            <label className={`cursor-pointer flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition transform hover:scale-105 active:scale-95 ${uploading ? 'bg-slate-600' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:to-emerald-500'}`}>
              {uploading ? (
                 <>
                   <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   <span>上傳中...</span>
                 </>
              ) : (
                 <>
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   <span>批量上傳照片</span>
                 </>
              )}
              <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
            
            <button onClick={() => setIsAuthenticated(false)} className="px-4 py-2 text-slate-500 hover:text-white transition">登出</button>
          </div>
        </header>

        {/* Grid List */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="relative group bg-slate-900 rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 transition">
              <img 
                src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url}
                className="w-full aspect-[2/3] object-cover"
                loading="lazy"
              />
              
              {/* 刪除遮罩 (只有 hover 時顯示) */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                 <a 
                    href={photo.url} 
                    target="_blank"
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition"
                    title="查看大圖"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                 </a>
                 <button 
                    onClick={() => setDeleteTargetId(photo.id)}
                    className="p-2 bg-red-600 hover:bg-red-500 rounded-full text-white transition shadow-lg"
                    title="刪除"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 backdrop-blur-sm">
                <p className="text-[10px] text-slate-400 font-mono text-center">ID: {photo.id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 刪除確認 Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
               <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="font-bold text-white mb-2 text-lg">確定要刪除嗎？</h3>
            <p className="text-slate-400 text-sm mb-6">這張照片將會永久消失。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTargetId(null)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition">取消</button>
              <button onClick={executeDelete} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition shadow-lg shadow-red-900/20">確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}