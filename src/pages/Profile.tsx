import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, Save, User, Wallet } from "lucide-react";

const Profile = () => {
  const { user, profile, loading, updateProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setUsername(profile.username || "");
      setWalletAddress(profile.wallet_address || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(newAvatarUrl);

      // Update profile
      await updateProfile({ avatar_url: newAvatarUrl });
      toast.success("Cập nhật avatar thành công!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Lỗi khi upload ảnh: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      toast.error("Username không được để trống");
      return;
    }

    setSaving(true);

    try {
      await updateProfile({
        display_name: displayName.trim() || null,
        username: username.trim(),
        wallet_address: walletAddress.trim() || null,
      });
      toast.success("Cập nhật thông tin thành công!");
    } catch (error: any) {
      toast.error("Lỗi: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fun-purple via-fun-pink to-fun-orange flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-fun-purple via-fun-pink to-fun-orange p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-fun-yellow/30 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-fun-cyan/30 rounded-full blur-3xl animate-float-delayed" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/chat")}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-bold text-white">Hồ sơ cá nhân</h1>
        </div>

        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader className="text-center">
            <CardTitle className="text-white">Thông tin của bạn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar 
                  className="w-32 h-32 border-4 border-white/30 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={handleAvatarClick}
                >
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="bg-fun-cyan text-white text-4xl">
                    <User className="w-16 h-16" />
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 w-10 h-10 bg-fun-yellow rounded-full flex items-center justify-center shadow-fun-3d hover:scale-110 transition-transform disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 text-fun-purple animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-fun-purple" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <p className="text-white/70 text-sm">Nhấn để đổi ảnh đại diện</p>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-white">
                  Tên hiển thị
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nhập tên hiển thị..."
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-white">
                  Username <span className="text-fun-yellow">*</span>
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập username..."
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="walletAddress" className="text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Địa chỉ ví (ETH)
                </Label>
                <Input
                  id="walletAddress"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white">Email</Label>
                <Input
                  value={user?.email || ""}
                  disabled
                  className="bg-white/5 border-white/10 text-white/50"
                />
                <p className="text-white/50 text-xs">Email không thể thay đổi</p>
              </div>
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-fun-yellow text-fun-purple font-bold hover:bg-fun-yellow/90 shadow-fun-3d"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Save className="w-5 h-5 mr-2" />
              )}
              Lưu thay đổi
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
