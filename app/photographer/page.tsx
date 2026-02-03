'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';

// 🔌 連線設定
const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.NEXT_PUBLIC_API_URL || 
  "https://event-saas-backend-production.up.railway.app";

// 建立 socket 連線
const socket = io(BACKEND_URL);
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin"; 

// --- 型別定義 ---
interface Face { 
    id: number; 
    boundingBox: { x: number; y: number; width: number; height: number }; 
    person?: { name: string; } 
}

interface Photo { 
    id: number; 
    url: string; 
    originalUrl?: string; 
    status: string; 
    faces?: Face[];
    downloadCount: number;
    shareCount: number;
    videoUrl?: string;
    videoStatus?: string;
}

interface Person { 
    id: number; 
    name: string; 
    phoneNumber: string; 
    seatNumber?: string; 
}

interface Stats {
    totalPhotos: number;
    totalDownloads: number;
    totalShares: number;
    topPhotos: Photo[];
}

export default function PhotographerPage() {
  // --- 狀態管理 ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [activeTab, setActiveTab] = useState<'photos' | 'guests' | 'stats'>('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<Person[]>([]);
  const [stats, setStats] = useState<Stats | null>(null); 
  
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');

  const [newGuest, setNewGuest] = useState({ name: '', phone: '', seat: '' });

  // --- 邏輯函數 ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
      loadStats(); 
    } else { 
      setErrorMsg('密碼錯誤'); 
      setPasswordInput(''); 
    }
  };

  const loadAllPhotos = () => {
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setPhotos(data); })
      .catch(console.error);
  };

  const loadAllGuests = () => {
    fetch(`${BACKEND_URL}/guests`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setGuests(data); })
      .catch(console.error);
  };

  const loadStats = () => {
    fetch(`${BACKEND_URL}/analytics/stats`)
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(console.error);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        setPhotos(prev => [newPhoto, ...prev.filter(p => p.id !== newPhoto.id)]);
        loadStats(); 
    });

    socket.on('photo_deleted', (id: number) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
        loadStats(); 
    });

    socket.on('video_ready', (data: { photoId: number, videoUrl: string }) => {
        console.log("🔔 收到新影片通知:", data);
        setPhotos(prev => prev.map(p => {
            if (p.id === data.photoId) {
                return { ...p, videoStatus: 'COMPLETED', videoUrl: data.videoUrl };
            }
            return p;
        }));
    });

    return () => { 
        socket.off('new_photo_ready'); 
        socket.off('photo_deleted'); 
        socket.off('video_ready'); 
    };
  }, [isAuthenticated]);

  const executeDeletePhoto = async () => {
    if (!deleteTargetId) return;
    try {
        const res = await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        if (res.ok) setDeleteTargetId(null);
    } catch (err) { alert('連線錯誤'); }
  };

  const handleDeleteGuest = async (id: number, name: string) => {
    if (!confirm(`刪除 ${name}?`)) return;
    try {
        const res = await fetch(`${BACKEND_URL}/guest/${id}`, { method: 'DELETE' });
        if (res.ok) setGuests(prev => prev.filter(g => g.id !== id));
    } catch (err) { alert('Err'); }
  };

  const handleDownload = async (photo: Photo) => {
    try {
        const imgUrl = viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url;
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `photo-${photo.id}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        window.open(photo.url, '_blank');
    }
  };

  const handleShare = (photo: Photo) => {
    const url = viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url;
    navigator.clipboard.writeText(url).then(() => alert("✅ 連結已複製！")).catch(() => alert("❌ 複製失敗"));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    const options = { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8, fileType: 'image/jpeg' };
    for (let i = 0; i < e.target.files.length; i++) {
        const originalFile = e.target.files[i];
        try {
            const compressedFile = await imageCompression(originalFile, options);
            const finalFile = new File([compressedFile], originalFile.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() });
            const formData = new FormData();
            formData.append('photo', finalFile);
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        } catch (error) { console.error(error); }
    }
    setUploading(false);
    loadAllPhotos();
    e.target.value = ''; 
  };

  const handleAddGuest = async (e: React.FormEvent) => {
     e.preventDefault();
     if(!newGuest.phone) return;
     await fetch(`${BACKEND_URL}/upsert-guest`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name:newGuest.name, phone:newGuest.phone, seatNumber:newGuest.seat}) });
     setNewGuest({name:'', phone:'', seat:''});
     loadAllGuests();
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;
      Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: async (results) => {
              const guests = results.data.map((r:any) => ({ name: r.name||r.Name||'', phone: r.phone||r.Phone||'', seatNumber: r.seat||r.Seat||'' })).filter((g:any)=>g.phone);
              if(!confirm(`匯入 ${guests.length} 筆?`)) return;
              await fetch(`${BACKEND_URL}/upsert-guests-bulk`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({guests}) });
              loadAllGuests();
              e.target.value='';
          }
      });
  };

  const handleGenerateVideo = async (photoId: number) => {
    if (!confirm("確定要消耗點數將這張照片生成「擁抱影片」嗎？(需等待約2-3分鐘)")) return;
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, videoStatus: 'PROCESSING' } : p));
    try {
        const res = await fetch(`${BACKEND_URL}/photos/generate-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoId })
        });
        if (!res.ok) throw new Error("請求失敗");
        alert("✅ 生成請求已發送！請稍後回來查看結果。");
    } catch (error) {
        alert("❌ 生成請求失敗");
        setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, videoStatus: 'FAILED' } : p));
    }
  };

  // --- 子視圖組件 (拆分出來以避免括號錯誤) ---
  
  const PhotosView = () => (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 px-1 pb-20">
        {photos.map(photo => (
            <div key={photo.id} className="break-inside-avoid relative group bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 mb-4 transition">
                <div className="relative w-full"> 
                    <img src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url} className="w-full h-auto block" loading="lazy" />
                    {photo.faces?.map((face, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${face.boundingBox.x * 100}%`, top: `${face.boundingBox.y * 100}%`, width: `${face.boundingBox.width * 100}%`, height: `${face.boundingBox.height * 100}%`, border: '2px solid #22c55e', boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)' }}>
                            {face.person && <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap z-10">{face.person.name}</div>}
                        </div>
                    ))}
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(photo.id); }} className="absolute top-2 right-2 p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition backdrop-blur-sm shadow-md z-20">🗑️</button>
                </div> 
                <div className="grid grid-cols-2 border-b border-slate-800 divide-x divide-slate-800">
                    <button onClick={() => handleDownload(photo)} className="p-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center gap-1">⬇️ 下載</button>
                    <button onClick={() => handleShare(photo)} className="p-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center gap-1">🔗 分享</button>
                </div>
                <div className="p-3 bg-slate-900/90 border-t border-slate-800">
                    {photo.videoStatus === 'COMPLETED' && photo.videoUrl ? (
                        <div className="space-y-2 animate-in fade-in">
                            <p className="text-[10px] font-bold text-green-400 flex items-center gap-1">✨ 擁抱影片已生成</p>
                            <video controls src={photo.videoUrl} className="w-full rounded border border-slate-700 aspect-video bg-black" />
                            <a href={photo.videoUrl} download target="_blank" className="block text-center text-[10px] text-blue-400 hover:text-blue-300">下載影片</a>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px]">
                                {photo.videoStatus === 'PROCESSING' && <span className="text-yellow-500 animate-pulse flex items-center gap-1">⏳ 製作中...</span>}
                                {photo.videoStatus === 'FAILED' && <span className="text-red-400">❌ 失敗</span>}
                            </div>
                            {(!photo.videoStatus || photo.videoStatus === 'IDLE' || photo.videoStatus === 'FAILED') && (
                                <button onClick={() => handleGenerateVideo(photo.id)} className="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] px-2 py-1 rounded border border-purple-500/30 transition-colors w-full">🎥 生成擁抱影片</button>
                            )}
                        </div>
                    )}
                </div>
                <div className="px-3 py-2 flex justify-between text-[10px] text-slate-500 bg-slate-950/50 border-t border-slate-800">
                    <span>下載 {photo.downloadCount || 0}</span>
                    <span>分享 {photo.shareCount || 0}</span>
                </div>
            </div>
        ))}
    </div>
  );

  const GuestsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
        <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative shadow-lg">
                <h3 className="text-lg font-bold text-white mb-4">CSV 匯入</h3>
                <label className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800/50 transition"><span className="text-blue-400 text-sm font-bold">點擊上傳 CSV</span><input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" /></label>
            </div>
            <form onSubmit={handleAddGuest} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg space-y-4">
                <h3 className="text-lg font-bold text-white">新增嘉賓</h3>
                <input value={newGuest.name} onChange={e=>setNewGuest({...newGuest, name:e.target.value})} placeholder="姓名" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" />
                <input value={newGuest.phone} onChange={e=>setNewGuest({...newGuest, phone:e.target.value})} placeholder="電話" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" />
                <input value={newGuest.seat} onChange={e=>setNewGuest({...newGuest, seat:e.target.value})} placeholder="座位 (選填)" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" />
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition">新增</button>
            </form>
        </div>
        <div className="md:col-span-2">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center"><span className="text-slate-400 text-sm">名單 ({guests.length})</span><button onClick={loadAllGuests} className="text-xs text-blue-400">刷新</button></div>
                <div className="max-h-[75vh] overflow-y-auto">
                    <table className="w-full text-left"><thead className="bg-slate-900 text-slate-400 text-xs"><tr><th className="p-4">姓名</th><th className="p-4">電話</th><th className="p-4">操作</th></tr></thead>
                    <tbody className="divide-y divide-slate-800">{guests.map(g => (<tr key={g.id}><td className="p-4">{g.name}</td><td className="p-4">{g.phoneNumber}</td><td className="p-4"><button onClick={()=>handleDeleteGuest(g.id, g.name)} className="text-red-500">🗑️</button></td></tr>))}</tbody></table>
                </div>
            </div>
        </div>
    </div>
  );

  const StatsView = () => (
    <div className="space-y-8 pb-20 animate-in fade-in zoom-in duration-300">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h3 className="text-slate-400 text-sm font-bold uppercase mb-2">📸 總照片數</h3>
                <p className="text-4xl font-extrabold text-white">{stats?.totalPhotos || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-900/40 to-slate-900 p-6 rounded-2xl border border-blue-500/30 shadow-xl">
                <h3 className="text-blue-400 text-sm font-bold uppercase mb-2">⬇️ 總下載次數</h3>
                <p className="text-4xl font-extrabold text-blue-100">{stats?.totalDownloads || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 p-6 rounded-2xl border border-purple-500/30 shadow-xl">
                <h3 className="text-purple-400 text-sm font-bold uppercase mb-2">🔗 總分享次數</h3>
                <p className="text-4xl font-extrabold text-purple-100">{stats?.totalShares || 0}</p>
            </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50"><h3 className="text-xl font-bold text-white flex items-center gap-2">🏆 人氣照片排行榜</h3><button onClick={loadStats} className="text-xs px-3 py-1 bg-slate-700 rounded-full hover:bg-slate-600 transition">↻ 重新整理</button></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-950 text-slate-400 text-xs uppercase"><tr><th className="p-4 w-20">排名</th><th className="p-4">照片</th><th className="p-4">相中主角</th><th className="p-4 text-center">下載</th><th className="p-4 text-center">分享</th><th className="p-4 text-right">熱度分數</th></tr></thead>
                    <tbody className="divide-y divide-slate-800">
                        {stats?.topPhotos.map((photo, index) => (
                            <tr key={photo.id} className="hover:bg-slate-800/30 transition">
                                <td className="p-4 font-bold text-2xl text-slate-500">#{index + 1}</td>
                                <td className="p-4"><div className="w-16 h-20 rounded-lg overflow-hidden border border-slate-700"><img src={photo.url} className="w-full h-full object-cover" /></div></td>
                                <td className="p-4">{photo.faces && photo.faces.length > 0 ? (<div className="flex flex-wrap gap-1">{photo.faces.map((f, i) => f.person ? (<span key={i} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300 border border-slate-700">{f.person.name}</span>) : null)}</div>) : <span className="text-slate-600 italic">無人名</span>}</td>
                                <td className="p-4 text-center text-blue-400 font-mono font-bold">{photo.downloadCount || 0}</td>
                                <td className="p-4 text-center text-purple-400 font-mono font-bold">{photo.shareCount || 0}</td>
                                <td className="p-4 text-right"><span className="text-xl font-bold text-green-400">{(photo.downloadCount || 0) + (photo.shareCount || 0)}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );

  // --- 主要渲染邏輯 ---

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl text-center space-y-4 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white">攝影師後台</h2>
          <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="密碼" className="w-full px-4 py-2 rounded bg-slate-900 text-white border border-slate-600 outline-none" />
          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-bold">解鎖</button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md py-4 -mx-6 px-6 border-b border-slate-800/50">
          <div className="flex w-full md:w-auto justify-between md:justify-start items-center gap-4">
             <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 shrink-0">工作台</h1>
             <div className="flex bg-slate-900 rounded-lg p-1 shrink-0 border border-slate-800">
                <button onClick={() => setActiveTab('photos')} className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeTab==='photos'?'bg-blue-600 text-white shadow-lg':'text-slate-400'}`}>照片</button>
                <button onClick={() => setActiveTab('guests')} className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeTab==='guests'?'bg-blue-600 text-white shadow-lg':'text-slate-400'}`}>名單</button>
                <button onClick={() => { setActiveTab('stats'); loadStats(); }} className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeTab==='stats'?'bg-purple-600 text-white shadow-lg':'text-slate-400'}`}>📊 數據</button>
             </div>
          </div>
          
          {activeTab === 'photos' && (
             <div className="flex w-full md:w-auto justify-between md:justify-end gap-3 items-center">
                <div className="flex bg-slate-900 rounded-lg p-1 text-xs shrink-0 border border-slate-800">
                    <button onClick={() => setViewMode('original')} className={`px-3 py-2 rounded-md transition ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500'}`}>原圖</button>
                    <button onClick={() => setViewMode('framed')} className={`px-3 py-2 rounded-md transition ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500'}`}>合成</button>
                </div>
                <label className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-white font-bold text-sm hover:from-green-500 hover:to-green-400 transition shadow-lg transform active:scale-95 ${uploading?'opacity-50 cursor-not-allowed':''}`}>
                    {uploading ? <span>處理中...</span> : <span>＋ 上傳</span>}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {/* 頁面內容 */}
        {activeTab === 'photos' && <PhotosView />}
        {activeTab === 'guests' && <GuestsView />}
        {activeTab === 'stats' && <StatsView />}

        {/* 刪除 Modal */}
        {deleteTargetId && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-slate-800 p-6 rounded text-center border border-slate-700">
                    <h3 className="text-white mb-4">刪除此照片？</h3>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 bg-slate-600 rounded">取消</button>
                        <button onClick={executeDeletePhoto} className="px-4 py-2 bg-red-600 rounded text-white">確認</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </main>
  );
}