'use client';

import { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';

// --- 常數設定 ---
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin"; 

// --- TypeScript 介面 ---
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
    // 確保後端回傳的資料包含這些欄位，或者前端預設為 null
    videoStatus?: 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
    videoUrl?: string;
}
interface Person { id: number; name: string; phoneNumber: string; seatNumber?: string; }

export default function PhotographerPage() {
  // 1. 驗證與核心狀態
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 2. SaaS 功能開關 (Feature Flag)
  // 您可以暫時將預設值改成 true 來測試： useState(true)
  const [isAiFeatureEnabled, setIsAiFeatureEnabled] = useState(false);

  // 3. 頁面導覽狀態
  const [activeTab, setActiveTab] = useState<'photos' | 'guests' | 'stats' | 'ai_video'>('photos');
  
  // 4. 資料狀態
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<Person[]>([]);
  const [stats, setStats] = useState({ totalPhotos: 0, totalDownloads: 0, totalShares: 0 });
  
  // 5. 操作狀態
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', seat: '' });

  // 6. AI 影片播放器狀態
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);

  // --- 計算屬性：篩選出「有影片相關狀態」的照片 ---
  // 這就是您的「影片存檔」列表來源
  const videoPhotos = useMemo(() => {
    return photos.filter(p => 
        p.videoStatus === 'PROCESSING' || 
        p.videoStatus === 'COMPLETED' || 
        p.videoStatus === 'FAILED'
    );
  }, [photos]);

  // 當前播放器要顯示的內容
  const currentVideoPhoto = useMemo(() => {
      // 如果用戶選了某個影片，就顯示那個
      if (selectedVideoId) {
          return videoPhotos.find(p => p.id === selectedVideoId) || null;
      }
      // 否則預設顯示列表中的第一個
      return videoPhotos.length > 0 ? videoPhotos[0] : null;
  }, [selectedVideoId, videoPhotos]);


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
      loadStats();
    } else { setErrorMsg('密碼錯誤'); setPasswordInput(''); }
  };

  const loadAllPhotos = () => { fetch(`${BACKEND_URL}/photos`).then(res => res.json()).then(data => { if (Array.isArray(data)) setPhotos(data); }).catch(console.error); };
  const loadAllGuests = () => { fetch(`${BACKEND_URL}/guests`).then(res => res.json()).then(data => { if (Array.isArray(data)) setGuests(data); }).catch(console.error); };
  const loadStats = () => { fetch(`${BACKEND_URL}/analytics/stats`).then(res => res.json()).then(data => setStats(data)).catch(console.error); };

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
    
    // 影片生成完成監聽
    socket.on('video_ready', ({ photoId, videoUrl }: { photoId: number, videoUrl: string }) => { 
        setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, videoStatus: 'COMPLETED', videoUrl } : p)); 
        // 當影片完成時，如果用戶在 AI 頁面，自動選中該影片
        if (activeTab === 'ai_video') {
            setSelectedVideoId(photoId);
        }
    });

    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); socket.off('video_ready'); };
  }, [isAuthenticated, activeTab]);

  const handleDirectDownload = (e: React.MouseEvent, photo: Photo) => { e.stopPropagation(); e.preventDefault(); window.location.href = `${BACKEND_URL}/photos/${photo.id}/download-proxy`; };
  const handleShare = async (e: React.MouseEvent, photo: Photo) => { e.stopPropagation(); e.preventDefault(); try { fetch(`${BACKEND_URL}/analytics/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id, type: 'SHARE' }) }); } catch (e) {} if (navigator.share) { navigator.share({ title: '活動照片', url: photo.url }).catch(console.error); } else { navigator.clipboard.writeText(photo.url); alert("連結已複製！"); } };
  
  // --- 關鍵修改：點擊做影片後，自動切換分頁 ---
  const handleGenerateVideo = async (e: React.MouseEvent, photo: Photo) => { 
      e.stopPropagation(); e.preventDefault(); 
      if (photo.videoStatus === 'PROCESSING') return; 
      
      // 1. UI 狀態更新：標記為製作中
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, videoStatus: 'PROCESSING' } : p)); 
      
      // 2. 自動切換到 AI 影片分頁，讓用戶知道東西去哪了
      setActiveTab('ai_video');
      setSelectedVideoId(photo.id);

      try { 
          const res = await fetch(`${BACKEND_URL}/photos/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) }); 
          if (!res.ok) throw new Error("API Error"); 
      } catch (err) { 
          alert("生成請求失敗，請稍後再試"); 
          setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, videoStatus: null } : p)); 
      } 
  };

  const executeDeletePhoto = async () => { if (!deleteTargetId) return; try { const res = await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' }); if (res.ok) { setDeleteTargetId(null); } else { alert("刪除失敗"); } } catch (err) { alert('連線錯誤'); } };
  const handleDeleteGuest = async (id: number, name: string) => { if (!confirm(`確定要刪除賓客「${name}」嗎？`)) return; try { const res = await fetch(`${BACKEND_URL}/guest/${id}`, { method: 'DELETE' }); if (res.ok) setGuests(prev => prev.filter(g => g.id !== id)); } catch (err) { alert('連線錯誤'); } };
  const downloadTemplate = () => { const csvContent = "\uFEFFphone,name,seat\n85291234567,陳大文,Table 1"; const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "template.csv"; link.click(); };
  
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files?.length) return; setUploading(true); const options = { maxSizeMB: 1, maxWidthOrHeight: 2048, useWebWorker: true, initialQuality: 0.8 }; for (let i = 0; i < e.target.files.length; i++) { const originalFile = e.target.files[i]; try { const compressedFile = await imageCompression(originalFile, options); const finalFile = new File([compressedFile], originalFile.name, { type: compressedFile.type, lastModified: Date.now() }); const formData = new FormData(); formData.append('photo', finalFile); await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }); } catch (error) { const formData = new FormData(); formData.append('photo', originalFile); await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }); } } setUploading(false); loadAllPhotos(); loadStats(); e.target.value = ''; };
  const handleAddGuest = async (e: React.FormEvent) => { e.preventDefault(); if (!newGuest.phone) return alert("電話是必填的"); try { await fetch(`${BACKEND_URL}/upsert-guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGuest.name, phone: newGuest.phone, seatNumber: newGuest.seat }) }); setNewGuest({ name: '', phone: '', seat: '' }); loadAllGuests(); } catch (err) { alert("連線錯誤"); } };
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; Papa.parse(file, { header: true, skipEmptyLines: true, complete: async (results) => { const parsedData = results.data; if (parsedData.length === 0) return alert("CSV 是空的！"); const formattedGuests = parsedData.map((row: any) => ({ name: row.name || row.Name || row.姓名 || '', phone: row.phone || row.Phone || row.電話 || '', seatNumber: row.seat || row.Seat || row.座位 || '' })).filter((g: any) => g.phone); if (!confirm(`⚠️ 這將【清空】舊資料並匯入 ${formattedGuests.length} 筆新名單。確定嗎？`)) return; try { const res = await fetch(`${BACKEND_URL}/upsert-guests-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests: formattedGuests }) }); if (res.ok) { alert(`🎉 成功匯入！`); loadAllGuests(); } } catch (err) { alert(`上傳失敗`); } e.target.value = ''; } }); };

  if (!isAuthenticated) { return ( <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4"> <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl text-center space-y-4"> <h2 className="text-xl font-bold text-white">攝影師後台</h2> <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="密碼" className="w-full px-4 py-2 rounded bg-slate-900 text-white" /> {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>} <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-bold">解鎖</button> </form> </div> ); }

  return (
    <main className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        
        {/* === Header 區域 === */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex w-full md:w-auto flex-wrap items-center gap-4">
             {/* 標題與開關 */}
             <div className="flex items-center gap-4 mr-4">
                <h1 className="text-2xl font-bold text-white shrink-0">工作台</h1>
                
                {/* [SaaS 控制器] 模擬 Super Admin 開關 */}
                <label className="flex items-center gap-2 px-3 py-1 bg-yellow-900/30 border border-yellow-700/50 rounded cursor-pointer group hover:bg-yellow-900/50 transition">
                    <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={isAiFeatureEnabled} onChange={e => setIsAiFeatureEnabled(e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-500"></div>
                    </div>
                    <span className="text-[10px] text-yellow-500 font-mono font-bold group-hover:text-yellow-400">
                        AI MODE {isAiFeatureEnabled ? 'ON' : 'OFF'}
                    </span>
                </label>
             </div>

             {/* 分頁按鈕群組 */}
             <div className="flex bg-slate-900 rounded p-1 shrink-0 overflow-x-auto max-w-full">
                <button onClick={() => setActiveTab('photos')} className={`px-3 py-1 text-sm rounded transition whitespace-nowrap ${activeTab==='photos'?'bg-blue-600 text-white':'text-slate-400 hover:text-white'}`}>照片</button>
                <button onClick={() => setActiveTab('guests')} className={`px-3 py-1 text-sm rounded transition whitespace-nowrap ${activeTab==='guests'?'bg-blue-600 text-white':'text-slate-400 hover:text-white'}`}>名單</button>
                <button onClick={() => { setActiveTab('stats'); loadStats(); }} className={`px-3 py-1 text-sm rounded transition whitespace-nowrap ${activeTab==='stats'?'bg-blue-600 text-white':'text-slate-400 hover:text-white'}`}>數據</button>
                
                {/* [重要] 這裡就是 AI 影片分頁按鈕，確認 isAiFeatureEnabled 為 true 時會顯示 */}
                {isAiFeatureEnabled && (
                    <button 
                        onClick={() => setActiveTab('ai_video')} 
                        className={`ml-2 px-3 py-1 text-sm rounded transition flex items-center gap-2 whitespace-nowrap font-bold
                            ${activeTab==='ai_video' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'bg-slate-800 text-purple-400 hover:bg-slate-700 hover:text-purple-300 border border-purple-500/30'}
                        `}
                    >
                        <span>🎬 AI 影片庫</span>
                        {/* 如果有影片正在製作，顯示一個紅色小圓點 */}
                        {videoPhotos.some(v => v.videoStatus === 'PROCESSING') && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                        )}
                    </button>
                )}
             </div>
          </div>

          {activeTab === 'photos' && (
             <div className="flex w-full md:w-auto justify-between md:justify-end gap-3">
                <div className="flex bg-slate-900 rounded p-1 text-xs shrink-0">
                    <button onClick={() => setViewMode('original')} className={`px-3 py-2 rounded ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500'}`}>原圖</button>
                    <button onClick={() => setViewMode('framed')} className={`px-3 py-2 rounded ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500'}`}>合成</button>
                </div>
                <label className={`flex-1 md:flex-none cursor-pointer flex items-center justify-center px-4 py-2 bg-green-600 rounded text-white font-bold text-sm hover:bg-green-500 transition ${uploading?'opacity-50':''}`}>
                    {uploading ? '...' : '＋ 上傳'}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {/* === 1. 照片分頁 (變得乾淨了，移除播放器) === */}
        {activeTab === 'photos' && (
            <div className="columns-2 md:columns-4 lg:columns-5 gap-4 space-y-4 mx-auto">
            {photos.map(photo => (
                <div key={photo.id} className="break-inside-avoid group bg-slate-900 rounded-lg overflow-hidden border border-slate-800 mb-4 shadow-lg">
                    
                    <div className="relative w-full bg-black"> 
                        <img 
                            key={`${photo.id}-${viewMode}`} 
                            src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url} 
                            className="w-full h-auto block" 
                            loading="lazy" 
                            alt={`Photo ${photo.id}`} 
                        />
                        
                        {/* 刪除按鈕 */}
                        <button onClick={() => setDeleteTargetId(photo.id)} className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-20 shadow-lg">🗑️</button>
                        
                        {/* 狀態標籤：如果正在製作或已完成，在圖上顯示小標記 */}
                        {isAiFeatureEnabled && photo.videoStatus && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded border border-white/10 text-[10px] text-white flex items-center gap-1 z-10">
                                {photo.videoStatus === 'PROCESSING' && <><span className="animate-spin">⏳</span> 製作中</>}
                                {photo.videoStatus === 'COMPLETED' && '✅ 已生成'}
                            </div>
                        )}
                    </div>

                    {/* [SaaS 控制] 按鈕區 */}
                    <div className="flex items-center justify-between bg-slate-800 border-t border-slate-700 divide-x divide-slate-700">
                        <button 
                            onClick={(e) => handleDirectDownload(e, photo)} 
                            className="flex-1 py-3 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center justify-center gap-1 text-xs font-bold"
                        >
                            ⬇️ 下載
                        </button>
                        
                        {/* 只有在 AI 功能開啟時才顯示這個按鈕 */}
                        {isAiFeatureEnabled && (
                            <button 
                                onClick={(e) => handleGenerateVideo(e, photo)} 
                                disabled={photo.videoStatus === 'PROCESSING'}
                                className={`flex-1 py-3 transition flex items-center justify-center gap-1 text-xs font-bold
                                    ${photo.videoStatus === 'COMPLETED' ? 'bg-slate-800 text-purple-300 hover:bg-purple-900/20' : 
                                    photo.videoStatus === 'PROCESSING' ? 'bg-slate-800 text-yellow-400 cursor-wait' : 
                                    'bg-purple-900/30 text-purple-300 hover:bg-purple-600 hover:text-white'}
                                `}
                            >
                                {photo.videoStatus === 'COMPLETED' ? '▶️ 看影片' : 
                                photo.videoStatus === 'PROCESSING' ? '⏳ 製作中' : 
                                '✨ 做影片'}
                            </button>
                        )}
                    </div>
                </div>
            ))}
            </div>
        )}

        {/* === 2. [新功能] AI 影片分頁 (這裡就是您要的影片存檔頁面) === */}
        {activeTab === 'ai_video' && isAiFeatureEnabled && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
                
                {/* 左側：主播放器 */}
                <div className="lg:col-span-2 bg-black rounded-2xl overflow-hidden border border-slate-800 flex flex-col relative shadow-2xl">
                    {currentVideoPhoto ? (
                        <>
                           <div className="flex-1 flex items-center justify-center bg-zinc-900 relative">
                               {currentVideoPhoto.videoStatus === 'COMPLETED' && currentVideoPhoto.videoUrl ? (
                                   <video 
                                       key={currentVideoPhoto.videoUrl} // Key 改變會強制重新載入影片
                                       src={currentVideoPhoto.videoUrl} 
                                       controls 
                                       autoPlay
                                       className="w-full h-full max-h-[75vh] object-contain" 
                                       poster={currentVideoPhoto.url} 
                                   />
                               ) : currentVideoPhoto.videoStatus === 'FAILED' ? (
                                   <div className="text-center text-red-400">
                                       <p className="text-4xl mb-4">❌</p>
                                       <p>影片生成失敗</p>
                                   </div>
                               ) : (
                                   <div className="text-center p-8">
                                       <div className="text-5xl mb-6 animate-bounce">⏳</div>
                                       <h3 className="text-2xl font-bold text-white">AI 正在努力運算中...</h3>
                                       <p className="text-slate-400 mt-2">約需 30-60 秒，完成後會自動播放。</p>
                                   </div>
                               )}
                           </div>
                           
                           {/* 播放器下方的資訊條 */}
                           <div className="bg-slate-900 p-4 border-t border-slate-800 flex justify-between items-center">
                               <div>
                                   <h3 className="text-white font-bold text-sm">Photo ID: {currentVideoPhoto.id}</h3>
                                   <p className="text-xs text-slate-500">狀態: {currentVideoPhoto.videoStatus}</p>
                               </div>
                               {currentVideoPhoto.videoStatus === 'COMPLETED' && (
                                   <div className="flex gap-3">
                                       <button onClick={(e) => handleDirectDownload(e, currentVideoPhoto)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white transition">⬇️ 下載影片</button>
                                       <button onClick={(e) => handleShare(e, currentVideoPhoto)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white transition">🔗 分享連結</button>
                                   </div>
                               )}
                           </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                            <p className="text-6xl mb-4">🎬</p>
                            <h3 className="text-xl text-slate-300 font-bold">尚無影片</h3>
                            <p className="text-sm mt-2">請回到「照片」頁面，點擊「做影片」按鈕。</p>
                        </div>
                    )}
                </div>

                {/* 右側：生成歷史列表 (這裡會存所有做過的影片) */}
                <div className="lg:col-span-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">🎬 影片庫 ({videoPhotos.length})</h3>
                        <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded">History</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {videoPhotos.length === 0 && (
                            <div className="text-center py-10 text-slate-600 text-sm">
                                暫無紀錄
                            </div>
                        )}
                        {videoPhotos.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => setSelectedVideoId(p.id)}
                                className={`flex gap-3 p-3 rounded-xl cursor-pointer transition border group
                                    ${selectedVideoId === p.id 
                                        ? 'bg-purple-900/20 border-purple-500/50' 
                                        : 'bg-slate-800/40 border-transparent hover:bg-slate-800 hover:border-slate-700'}
                                `}
                            >
                                {/* 列表縮圖 */}
                                <div className="w-24 h-16 bg-black rounded-lg overflow-hidden flex-shrink-0 relative border border-slate-700/50">
                                    <img src={p.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" alt="" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        {p.videoStatus === 'PROCESSING' && <span className="animate-spin text-xl">⏳</span>}
                                        {p.videoStatus === 'COMPLETED' && <span className="text-white drop-shadow-md text-xl">▶️</span>}
                                    </div>
                                </div>
                                
                                {/* 列表文字資訊 */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="text-sm font-bold text-slate-200 truncate">Photo #{p.id}</div>
                                    <div className="flex items-center gap-2 text-xs mt-1">
                                        {p.videoStatus === 'PROCESSING' && <span className="text-yellow-400 font-mono flex items-center gap-1"><span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span> 運算中...</span>}
                                        {p.videoStatus === 'COMPLETED' && <span className="text-green-400 font-mono">Completed</span>}
                                        {p.videoStatus === 'FAILED' && <span className="text-red-400 font-mono">Error</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* === 3. 名單分頁 (保持不變) === */}
        {activeTab === 'guests' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group">
                        <button onClick={downloadTemplate} className="absolute top-4 right-4 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300">下載範本</button>
                        <h3 className="text-lg font-bold text-white mb-2">CSV 匯入</h3>
                        <p className="text-xs text-slate-400 mb-4">⚠️ 上傳將會<span className="text-red-400 font-bold">清空舊名單</span></p>
                        <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800/50 transition"><span className="text-sm font-bold text-blue-400">📁 點擊上傳 CSV</span><input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" /></label>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl sticky top-4">
                        <h3 className="text-lg font-bold text-white mb-4">＋ 單筆新增</h3>
                        <form onSubmit={handleAddGuest} className="space-y-4">
                            <div><label className="text-xs text-slate-500 uppercase font-bold">電話</label><input type="text" value={newGuest.phone} onChange={e => setNewGuest({...newGuest, phone: e.target.value})} placeholder="91234567" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold">姓名</label><input type="text" value={newGuest.name} onChange={e => setNewGuest({...newGuest, name: e.target.value})} placeholder="陳大文" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold text-yellow-500">座位號</label><input type="text" value={newGuest.seat} onChange={e => setNewGuest({...newGuest, seat: e.target.value})} placeholder="Table 5" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none"/></div>
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">儲存</button>
                        </form>
                    </div>
                </div>
                <div className="md:col-span-2">
                     <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400 text-sm">已匯入名單 ({guests.length} 人)</span>
                            <button onClick={loadAllGuests} className="text-xs text-blue-400 hover:text-blue-300">↻ 重新整理</button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10">
                                    <tr><th className="p-4">姓名</th><th className="p-4">電話</th><th className="p-4">座位</th><th className="p-4 text-right">操作</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {guests.map(g => (
                                        <tr key={g.id} className="hover:bg-slate-800/50 transition">
                                            <td className="p-4 font-bold text-white">{g.name || '-'}</td><td className="p-4 text-slate-400 font-mono">{g.phoneNumber}</td><td className="p-4 text-yellow-500 font-bold">{g.seatNumber || '-'}</td>
                                            <td className="p-4 text-right"><button onClick={() => handleDeleteGuest(g.id, g.name || g.phoneNumber)} className="text-slate-600 hover:text-red-500 transition px-2 py-1">🗑️</button></td>
                                        </tr>
                                    ))}
                                    {guests.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-slate-500">尚無資料</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* === 4. 數據分頁 (保持不變) === */}
        {activeTab === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總照片數</h3>
                    <p className="text-4xl font-bold text-white">{stats.totalPhotos}</p>
                </div>
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總下載次數</h3>
                    <p className="text-4xl font-bold text-green-400">{stats.totalDownloads}</p>
                </div>
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                    <h3 className="text-slate-400 text-sm uppercase mb-2">總分享次數</h3>
                    <p className="text-4xl font-bold text-blue-400">{stats.totalShares}</p>
                </div>
            </div>
        )}
      </div>
      
      {/* 刪除確認 Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded text-center border border-slate-700">
                <h3 className="text-white mb-4 text-lg">刪除此照片？</h3>
                <div className="flex gap-4 justify-center">
                    <button onClick={() => setDeleteTargetId(null)} className="px-6 py-2 bg-slate-600 rounded text-white hover:bg-slate-500">取消</button>
                    <button onClick={executeDeletePhoto} className="px-6 py-2 bg-red-600 rounded text-white hover:bg-red-500">確認</button>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}