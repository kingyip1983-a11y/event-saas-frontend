// 檔案: frontend/src/app/register/page.tsx
'use client';
import { useState } from 'react';

// 👇 如果是在內網測試 (iPad)，請改成您的 Mac IP
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";

export default function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('852');
  
  // 👇 新增：電話錯誤訊息狀態
  const [phoneError, setPhoneError] = useState('');
  
  // Array 來存多張照片
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  
  const [status, setStatus] = useState('');

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPhotos(prev => [...prev, file]);
      setPreviews(prev => [...prev, URL.createObjectURL(file)]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // 👇 新增：處理電話輸入與驗證邏輯
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);

    // Regex 檢查：是否只包含數字 0-9
    const isNumeric = /^\d*$/.test(val);

    if (!isNumeric) {
      setPhoneError('⚠️ 格式錯誤：請只輸入數字，不要輸入 + 號、括號或空格');
    } else {
      setPhoneError(''); // 格式正確，清空錯誤訊息
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 二次檢查：如果還有錯誤訊息，或者沒填資料，不準送出
    if (phoneError || !name || !phone || photos.length === 0) {
        alert("請檢查資料是否正確");
        return;
    }
    
    setStatus('正在上傳多角度數據...');
    const formData = new FormData();
    formData.append('name', name);
    
    // 雖然前端擋住了，後端發送前還是做一次清潔比較保險
    const cleanNumber = phone.replace(/\D/g, ''); 
    formData.append('phone', countryCode + cleanNumber);

    photos.forEach((file) => {
        formData.append('photos', file);
    });

    try {
        const res = await fetch(`${BACKEND_URL}/register`, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            setStatus('失敗');
        } else {
            alert(`成功！系統記住了 ${data.count} 個角度！`);
            setName('');
            setPhone('');
            setPhotos([]);
            setPreviews([]);
            setStatus('');
        }
    } catch (err) {
        alert("連線錯誤");
        setStatus('錯誤');
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2">📸 多角度登記 (3連拍)</h1>
        <p className="text-gray-400 text-center mb-6 text-sm">
            建議拍攝：<br/>
            <span className="text-yellow-400">1. 正臉 &nbsp; 2. 微左側 &nbsp; 3. 微右側</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="flex gap-4 overflow-x-auto py-2 min-h-[100px]">
             {previews.map((src, idx) => (
                 <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 border-blue-500">
                     <img src={src} className="w-full h-full object-cover" />
                     <button 
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-0 right-0 bg-red-600 text-white w-6 h-6 flex items-center justify-center rounded-bl-lg text-xs"
                     >
                        ✕
                     </button>
                 </div>
             ))}
             
             {photos.length < 3 && (
                 <label className="flex-shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-500 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-400 transition text-gray-500 bg-gray-700/50">
                     <span className="text-2xl">+</span>
                     <span className="text-xs">加照片</span>
                     <input type="file" accept="image/*" capture="user" onChange={handlePhoto} className="hidden" />
                 </label>
             )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">您的姓名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" placeholder="King Yip" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">WhatsApp 電話</label>
            <div className="flex gap-2">
                <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 focus:outline-none focus:border-blue-500">
                    <option value="852">🇭🇰 +852</option>
                    <option value="86">🇨🇳 +86</option>
                    <option value="886">🇹🇼 +886</option>
                    <option value="1">🇺🇸 +1</option>
                </select>
                
                {/* 👇 修改過的電話輸入框：綁定 handlePhoneChange 並且有紅框樣式 */}
                <input 
                    type="tel" 
                    value={phone} 
                    onChange={handlePhoneChange} 
                    className={`flex-1 bg-gray-700 border rounded-lg px-4 py-3 focus:outline-none transition ${
                        phoneError 
                        ? 'border-red-500 focus:border-red-500' // 錯誤時變紅
                        : 'border-gray-600 focus:border-blue-500' 
                    }`} 
                    placeholder="61234567 (勿加空格/+)" 
                />
            </div>
            
            {/* 👇 錯誤訊息顯示區 */}
            {phoneError ? (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-pulse">
                    🚫 {phoneError}
                </p>
            ) : (
                <p className="text-gray-500 text-xs mt-2">
                    💡 請輸入純數字，無須國碼 (例: <span className="text-gray-300">63530145</span>)
                </p>
            )}
          </div>

          {/* 👇 按鈕鎖定邏輯：如果 phoneError 存在，按鈕會變灰且無法點擊 */}
          <button 
            type="submit" 
            disabled={status !== '' || photos.length === 0 || !name || !phone || !!phoneError} 
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status || `✅ 完成登記 (${photos.length} 張)`}
          </button>
        </form>
      </div>
    </main>
  );
}