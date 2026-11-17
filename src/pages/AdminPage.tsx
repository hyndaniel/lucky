import { useState, useEffect, useMemo } from "react";
import { useLotteryStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, Upload, Trash,
  ShieldAlert, MonitorPlay, LogOut,
  Plus, Pencil, Search
} from "lucide-react";
import { toast } from "sonner";
import { SAMPLE_CSV } from "@/assets/sample";
import hermesLogo from "@/assets/hermes-logo.jpg";
import { PHASE_LABELS } from "@/lib/phase-labels";
import { countWinnerPeople } from "@/lib/winner-records";
import { ImagePoolTab } from "@/components/admin/ImagePoolTab";
import { LiveControlPanel } from "@/components/admin/LiveControlPanel";
import { DisplayStyleTab } from "@/components/admin/DisplayStyleTab";
import { WinnersTab } from "@/components/admin/WinnersTab";
import { FONT_PRESETS } from "@/lib/defaults";
import { formatSerial } from "@/lib/serial";
import { decodeTextFile } from "@/lib/name-import";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // 从 sessionStorage 恢复登录状态（关闭浏览器后失效）
    return sessionStorage.getItem('admin_authenticated') === 'true';
  });
  const {
    participants, winners, prizes, settings, currentRound,
    importParticipants, fullReset, restoreDefaultPrizes,
    addPrize, updatePrize, removePrize, setSettings,
    addParticipant, updateParticipant, removeParticipant
  } = useLotteryStore();
  const phase = currentRound?.phase ?? 'idle';
  const isRolling = phase === 'rollingPrizes' || phase === 'rollingNames';

  const [csvText, setCsvText] = useState("");
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [confirmFullReset, setConfirmFullReset] = useState(false);
  // 有抽奖记录或本轮进行中时覆盖导入不可用（与 store 规则一致），强制追加
  const replaceLocked = winners.length > 0 || (currentRound !== null && currentRound.phase !== "idle");
  const effectiveImportMode = replaceLocked ? "append" : importMode;

  // 统计只算有人的记录：image-only 的记录没有参与者（id 为空）
  const wonPeopleCount = countWinnerPeople(winners);

  // 参与者 id → 已中奖奖项名
  const wonPrizeById = useMemo(() => {
    const prizeNames = new Map(prizes.map(prize => [prize.id, prize.name]));
    return new Map(winners.map(w => [w.id, prizeNames.get(w.prizeId) ?? '未知奖项']));
  }, [winners, prizes]);

  // 兼容旧版本曾经保存过空奖项列表的浏览器数据。
  useEffect(() => {
    if (prizes.length === 0) {
      restoreDefaultPrizes();
    }
  }, [prizes.length, restoreDefaultPrizes]);


  // 受控模式解锁：通过 URL 参数 ?controlled=1 解锁必中/禁中/权重功能
  // 支持两种格式：
  // 1. http://localhost:8081/?controlled=1#/admin
  // 2. http://localhost:8081/#/admin?controlled=1
  const [controlledModeUnlocked, setControlledModeUnlocked] = useState(false);

  useEffect(() => {
    // 先尝试从 location.search 获取（标准格式）
    let params = new URLSearchParams(window.location.search);
    if (params.get('controlled') === '1') {
      setControlledModeUnlocked(true);
      return;
    }
    // 再尝试从 hash 中解析（hash 路由格式）
    const hash = window.location.hash;
    const hashQueryIndex = hash.indexOf('?');
    if (hashQueryIndex !== -1) {
      params = new URLSearchParams(hash.slice(hashQueryIndex));
      setControlledModeUnlocked(params.get('controlled') === '1');
    }
  }, []);
  
  // Person Edit State
  const [editingPerson, setEditingPerson] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", dept: "", mustWinPrizeId: "none", bannedPrizes: [] as string[], weight: 1 });

  // Prize Edit State
  const [editingPrize, setEditingPrize] = useState<any>(null);
  const [isPrizeDialogOpen, setIsPrizeDialogOpen] = useState(false);
  const [prizeForm, setPrizeForm] = useState({ name: "", count: "" as number | "", description: "", image: "" });

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    title: settings.title,
    welcomeTitle: settings.welcomeTitle,
    welcomeSubtitle: 'BONDING',
    prizePageTitle: settings.prizePageTitle || '',
    password: settings.password,
    logo: settings.logo || hermesLogo,
    backgroundImage: settings.backgroundImage || '',
    fontFamily: settings.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    showDept: settings.showDept || false,
  });

  // 当 settings 变化时同步到表单（首次加载或外部变化）
  useEffect(() => {
    setSettingsForm({
      title: settings.title,
      welcomeTitle: settings.welcomeTitle,
      welcomeSubtitle: 'BONDING',
      prizePageTitle: settings.prizePageTitle || '',
      password: settings.password,
      logo: settings.logo || hermesLogo,
      backgroundImage: settings.backgroundImage || '',
      fontFamily: settings.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      showDept: settings.showDept || false,
    });
  }, [settings.title, settings.welcomeTitle, settings.welcomeSubtitle, settings.prizePageTitle, settings.password, settings.logo, settings.backgroundImage, settings.fontFamily, settings.showDept]);

  // Search
  const [searchTerm, setSearchTerm] = useState("");

  const handleLogin = () => {
    if (password === settings.password) {
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_authenticated', 'true');
      toast.success("已解锁控制台");
    } else {
      toast.error("密码错误");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('admin_authenticated');
    toast.success("已退出登录");
  };

  const handleSaveSettings = () => {
    setSettings(settingsForm);
    toast.success("设置已保存");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（限制 500KB）
    if (file.size > 500 * 1024) {
      toast.error("图片大小不能超过 500KB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettingsForm(current => ({ ...current, logo: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setSettingsForm(current => ({ ...current, logo: '' }));
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 背景图会持久化至 localStorage，避免单张图片占满浏览器配额。
    if (file.size > 1500 * 1024) {
      toast.error("背景图大小不能超过 1.5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettingsForm(current => ({ ...current, backgroundImage: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBackground = () => {
    setSettingsForm(current => ({ ...current, backgroundImage: '' }));
  };

  const handlePrizeImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      toast.error("奖品图片大小不能超过 800KB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPrizeForm(current => ({ ...current, image: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleImport = () => {
    if (!csvText.trim()) {
      toast.error("请粘贴数据后再点击执行导入");
      return;
    }
    const res = importParticipants(csvText, controlledModeUnlocked, effectiveImportMode);
    if (res.success) {
      toast.success(`成功导入 ${res.count} 人${res.duplicateNames > 0 ? `（其中 ${res.duplicateNames} 个重名，已按不同人处理）` : ""}`);
      setCsvText("");
    } else {
      toast.error(res.error);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setCsvText(decodeTextFile(await file.arrayBuffer()));
    } catch {
      toast.error("文件读取失败");
    }
    input.value = "";  // 允许再次选择同一文件
  };

  const handleDownloadTemplate = () => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'import_template.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openAddDialog = () => {
    setEditingPerson(null);
    setEditForm({ name: "", dept: "", mustWinPrizeId: "none", bannedPrizes: [], weight: 1 });
    setIsDialogOpen(true);
  };

  const openEditDialog = (person: any) => {
    setEditingPerson(person);
    setEditForm({
        name: person.name,
        dept: person.dept,
        mustWinPrizeId: person.mustWinPrizeId || "none",
        bannedPrizes: person.bannedPrizes || [],
        weight: person.weight
    });
    setIsDialogOpen(true);
  };

  const savePerson = () => {
    if (!editForm.name) {
        toast.error("姓名不能为空");
        return;
    }
    const payload = {
        ...editForm,
        mustWinPrizeId: editForm.mustWinPrizeId === "none" ? null : editForm.mustWinPrizeId
    };

    if (editingPerson) {
        updateParticipant(editingPerson.id, payload);
        toast.success("更新成功");
    } else {
        addParticipant(payload);
        toast.success("添加成功");
    }
    setIsDialogOpen(false);
  };

  // Prize edit functions
  const openAddPrizeDialog = () => {
    setEditingPrize(null);
    setPrizeForm({ name: "", count: "", description: "", image: "" });
    setIsPrizeDialogOpen(true);
  };

  const openEditPrizeDialog = (prize: any) => {
    setEditingPrize(prize);
    setPrizeForm({
      name: prize.name,
      count: prize.count,
      description: prize.description || "",
      image: prize.image || ""
    });
    setIsPrizeDialogOpen(true);
  };

  const savePrize = () => {
    if (!prizeForm.name) {
      toast.error("奖项名称不能为空");
      return;
    }
    const count = typeof prizeForm.count === "number" ? prizeForm.count : Number(prizeForm.count);
    if (!Number.isInteger(count) || count < 1) {
      toast.error("中奖人数至少为1");
      return;
    }

    const prizeData = { ...prizeForm, count };

    if (editingPrize) {
      updatePrize(editingPrize.id, prizeData);
      toast.success("奖项更新成功");
    } else {
      addPrize(prizeData);
      toast.success("奖项添加成功");
    }
    setIsPrizeDialogOpen(false);
  };

  const handleDeletePrize = (id: string) => {
    if (confirm("确定要删除此奖项吗？")) {
      const result = removePrize(id);
      if (result.ok) toast.success("奖项已删除");
      else toast.error(result.reason);
    }
  };

  // 强制轮询同步
  useEffect(() => {
    const timer = setInterval(() => {
      useLotteryStore.persist.rehydrate();
    }, 1000); 
    return () => clearInterval(timer);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="hermes-admin min-h-screen bg-background flex items-center justify-center">
        <Card className="w-[400px]">
          <CardHeader className="text-center">
            <CardTitle>后台管理系统</CardTitle>
            <CardDescription>请输入管理员密码</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              type="password" 
              placeholder="密码" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            <Button className="w-full" onClick={handleLogin}>登录</Button>
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div>默认密码：appinn</div>
              <div>数据保存在本地浏览器（localStorage），清理缓存会丢失。</div>
              <div>如需大屏展示，请先登录后打开右上角“打开大屏端”。</div>
            </div>
            <div className="text-center text-xs text-muted-foreground mt-4">
              <a href="#/" target="_blank" className="hover:underline flex items-center justify-center gap-1">
                <MonitorPlay className="w-3 h-3"/> 打开大屏显示端
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredParticipants = participants.filter(p =>
    p.name.includes(searchTerm) || p.dept.includes(searchTerm) || formatSerial('N', p.serial).toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <div className="hermes-admin min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 font-bold text-lg">
          <ShieldAlert className="w-5 h-5 text-primary"/>
          {settings.title}
        </div>
        <div className="flex items-center gap-4">

           <Button variant="outline" size="sm" asChild>
             <a href="#/" target="_blank"><MonitorPlay className="w-4 h-4 mr-2"/> 打开大屏端</a>
           </Button>
           <a
             href="https://github.com/scavin/lucky"
             target="_blank"
             rel="noreferrer"
             className="text-sm text-muted-foreground hover:text-foreground hover:underline"
           >
             GitHub
           </a>
           <Badge variant={isRolling ? "destructive" : "secondary"}>
             {PHASE_LABELS[phase]}
           </Badge>
           <Button variant="ghost" size="sm" onClick={handleLogout} title="退出登录">
             <LogOut className="w-4 h-4"/>
           </Button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        
        {/* 核心控制区 */}
        <LiveControlPanel
          controlledMode={controlledModeUnlocked}
          onEditPrize={openEditPrizeDialog}
          onDeletePrize={handleDeletePrize}
          onAddPrize={openAddPrizeDialog}
        />

        {/* 数据管理区 */}
        <Tabs defaultValue="participants" className="flex-1 flex flex-col overflow-hidden">
          <TabsList>
            <TabsTrigger value="participants">人员名单管理</TabsTrigger>
            <TabsTrigger value="import">批量导入</TabsTrigger>
            <TabsTrigger value="images">图片池</TabsTrigger>
            <TabsTrigger value="display-style">大屏样式与特效</TabsTrigger>
            <TabsTrigger value="winners">中奖记录</TabsTrigger>
            <TabsTrigger value="settings">系统设置</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 border rounded-md mt-2 bg-card overflow-hidden flex flex-col">
            {/* Tab: 人员名单列表 */}
            <TabsContent value="participants" className="flex-1 flex flex-col p-4 m-0 overflow-hidden">
                <div className="flex gap-4 items-center justify-between mb-4 flex-wrap">
                    <div className="flex gap-2 items-center flex-1">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="搜索姓名、部门或编号..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <Button onClick={openAddDialog}><Plus className="w-4 h-4 mr-2"/>添加人员</Button>
                    </div>
                    {controlledModeUnlocked && (
                      <div className="flex gap-4 items-center bg-muted/50 p-2 rounded-md border">
                          <div className="text-sm flex items-center gap-2">
                              <span>必中: </span>
                              <span className="font-mono font-bold px-2 rounded min-w-[30px] text-center">
                                  {participants.filter(p=>p.mustWinPrizeId).length}
                              </span>
                          </div>
                          <div className="w-px h-4 bg-border"></div>
                          <div className="text-sm flex items-center gap-2">
                              <span>禁中: </span>
                              <span className="font-mono font-bold px-2 rounded min-w-[30px] text-center">
                                  {participants.filter(p=>(p.bannedPrizes || []).length > 0).length}
                              </span>
                          </div>
                      </div>
                    )}
                </div>

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead>编号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>部门</TableHead>
                                <TableHead>状态</TableHead>
                                {controlledModeUnlocked && (
                                  <>
                                    <TableHead className="text-center w-[120px]">必中设置</TableHead>
                                    <TableHead className="text-center w-[80px]">禁中</TableHead>
                                    <TableHead className="text-center w-[60px]">权重</TableHead>
                                  </>
                                )}
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredParticipants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={controlledModeUnlocked ? 8 : 5} className="text-center py-8 text-muted-foreground">
                                        无匹配数据，请先导入或添加人员
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredParticipants.map(p => {
                                    const prizeName = prizes.find(prize => prize.id === p.mustWinPrizeId)?.name;
                                    return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{formatSerial('N', p.serial)}</TableCell>
                                            <TableCell className="font-medium">{p.name}</TableCell>
                                            <TableCell>{p.dept}</TableCell>
                                            <TableCell>
                                                {wonPrizeById.has(p.id)
                                                  ? <Badge variant="secondary">已中奖 · {wonPrizeById.get(p.id)}</Badge>
                                                  : <span className="text-muted-foreground">可抽</span>}
                                            </TableCell>
                                            {controlledModeUnlocked && (
                                              <>
                                                <TableCell className="text-center">
                                                    {p.mustWinPrizeId ? <Badge variant="secondary">{prizeName || '未知奖项'}</Badge> : <span className="text-muted-foreground">-</span>}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {(p.bannedPrizes || []).length > 0 ? (
                                                        <div className="flex flex-wrap justify-center gap-1">
                                                            {(p.bannedPrizes || []).map(id => {
                                                                const prize = prizes.find(pr => pr.id === id);
                                                                return prize ? <Badge key={id} variant="destructive" className="text-xs">{prize.name}</Badge> : null;
                                                            })}
                                                        </div>
                                                    ) : <span className="text-muted-foreground">-</span>}
                                                </TableCell>
                                                <TableCell className="text-center text-xs font-mono text-muted-foreground">{p.weight}</TableCell>
                                              </>
                                            )}
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)}><Pencil className="w-4 h-4"/></Button>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeParticipant(p.id)}><Trash className="w-4 h-4"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>

            {/* Tab: 批量导入 */}
            <TabsContent value="import" className="mt-0 p-4 space-y-4">
               <div className="flex gap-4 items-start">
                 <div className="flex-1 space-y-3">
                    <Label>粘贴名单或选择文件</Label>
                    <p className="text-xs text-muted-foreground">支持：每行一个姓名；或 姓名,部门；或带表头的 CSV；也可直接从 Excel 复制粘贴（.xlsx 请先另存为 CSV）</p>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" asChild>
                        <label className="cursor-pointer">
                          <Upload className="w-4 h-4 mr-2"/> 选择文件
                          <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleImportFile} />
                        </label>
                      </Button>
                      <span className="text-xs text-muted-foreground">.csv / .txt / .tsv，读取后可继续编辑</span>
                    </div>
                    <Textarea
                      placeholder={controlledModeUnlocked
                        ? "姓名,部门,必中奖项(奖项名称),禁止奖项,权重(1-10)..."
                        : "姓名,部门..."
                      }
                      value={csvText}
                      onChange={e => setCsvText(e.target.value)}
                      className="font-mono text-xs min-h-[300px]"
                    />
                    <RadioGroup
                      value={effectiveImportMode}
                      onValueChange={value => setImportMode(value as "replace" | "append")}
                      className="flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="replace" id="import-mode-replace" disabled={replaceLocked} />
                        <Label htmlFor="import-mode-replace" className={replaceLocked ? "text-muted-foreground" : ""}>覆盖现有名单</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="append" id="import-mode-append" />
                        <Label htmlFor="import-mode-append">追加到现有名单</Label>
                      </div>
                    </RadioGroup>
                    {replaceLocked && (
                      <p className="text-xs text-muted-foreground">已有抽奖记录或本轮正在进行，只能追加导入；如需覆盖请先在“中奖记录”中重置清零。</p>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={handleImport}><Upload className="w-4 h-4 mr-2"/> 执行导入</Button>
                      {controlledModeUnlocked && (
                        <Button variant="outline" onClick={handleDownloadTemplate}><Download className="w-4 h-4 mr-2"/> 下载 CSV 模板</Button>
                      )}
                    </div>
                 </div>
                 <div className="w-[300px] border-l pl-4 space-y-4">
                    <div className="p-4 bg-muted rounded text-sm space-y-2">
                        <div className="font-bold mb-2">数据统计</div>
                        <div>总人数: {participants.length}</div>
                        <div>已中奖: {wonPeopleCount}</div>
                        <div>剩余: {participants.length - wonPeopleCount}</div>
                    </div>
                    <Button variant="destructive" className="w-full" onClick={() => setConfirmFullReset(true)}>
                      <Trash className="w-4 h-4 mr-2"/> 清空数据库
                    </Button>
                 </div>
               </div>
            </TabsContent>

            {/* Tab: 图片池 */}
            <TabsContent value="images" className="mt-0 p-4 overflow-auto">
              <ImagePoolTab />
            </TabsContent>

            {/* Tab: 大屏样式与特效 */}
            <TabsContent value="display-style" className="mt-0 p-4 overflow-auto">
              <DisplayStyleTab />
            </TabsContent>

            {/* Tab: 中奖记录 */}
            <TabsContent value="winners" className="mt-0 p-4 overflow-auto">
              <WinnersTab />
            </TabsContent>

            {/* Tab: 设置 */}
            <TabsContent value="settings" className="mt-0 p-4 max-w-md space-y-6">
               <div className="space-y-2">
                 <Label>抽奖页主标题</Label>
                 <Input value={settingsForm.title} onChange={e => setSettingsForm({...settingsForm, title: e.target.value})} />
               </div>
               <div className="space-y-2">
                 <Label>欢迎页主标题</Label>
                 <Input value={settingsForm.welcomeTitle} onChange={e => setSettingsForm({...settingsForm, welcomeTitle: e.target.value})} />
               </div>
               <div className="space-y-2">
                 <Label>欢迎页副标题</Label>
                 <Input value="BONDING" readOnly disabled />
               </div>
               <div className="space-y-2">
                 <Label>大屏展示字体</Label>
                 <Select
                   value={settingsForm.fontFamily}
                   onValueChange={value => setSettingsForm({...settingsForm, fontFamily: value})}
                 >
                   <SelectTrigger className="w-full">
                     <SelectValue placeholder="选择展示字体" />
                   </SelectTrigger>
                   <SelectContent>
                     {FONT_PRESETS.map(font => (
                       <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <p className="text-xs text-muted-foreground">仅影响大屏端；会优先使用设备中已安装的对应字体。</p>
               </div>
               <div className="space-y-2">
                 <Label>大屏背景图</Label>
                 <div className="flex items-center gap-4">
                   {settingsForm.backgroundImage ? (
                     <div className="relative">
                       <img src={settingsForm.backgroundImage} alt="大屏背景预览" className="h-24 w-44 rounded border object-cover" />
                       <button
                         type="button"
                         onClick={handleRemoveBackground}
                         className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center hover:bg-destructive/80"
                         aria-label="移除背景图"
                       >
                         ×
                       </button>
                     </div>
                   ) : (
                     <label className="flex items-center gap-2 px-4 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                       <Upload className="w-4 h-4" />
                       <span className="text-sm">上传背景图</span>
                       <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" />
                     </label>
                   )}
                 </div>
                 <p className="text-xs text-muted-foreground">建议使用 16:9 图片，大小不超过 1.5MB；未上传时使用默认背景。</p>
               </div>
               <div className="space-y-2">
                 <Label>公司 Logo（欢迎页显示）</Label>
                 <div className="flex items-center gap-4">
                   {settingsForm.logo ? (
                     <div className="relative">
                       <img src={settingsForm.logo} alt="公司 Logo" className="h-16 max-w-[220px] object-contain border rounded p-1 bg-white" />
                       <button
                         type="button"
                         onClick={handleRemoveLogo}
                         className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center hover:bg-destructive/80"
                         aria-label="移除 Logo"
                       >
                         ×
                       </button>
                     </div>
                   ) : (
                     <label className="flex items-center gap-2 px-4 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                       <Upload className="w-4 h-4" />
                       <span className="text-sm">上传 Logo</span>
                       <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                     </label>
                   )}
                 </div>
                 <p className="text-xs text-muted-foreground">默认使用 Hermès Logo，也可以上传自定义 Logo（不超过 500KB）</p>
               </div>
               <div className="space-y-2">
                 <Label>奖项页标题</Label>
                 <Input value={settingsForm.prizePageTitle} onChange={e => setSettingsForm({...settingsForm, prizePageTitle: e.target.value})} />
               </div>
               <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
                 <div className="space-y-0.5">
                   <Label>显示部门名称</Label>
                   <p className="text-xs text-muted-foreground">在抽奖滚动和大屏中奖展示时，显示参与者的所属部门。</p>
                 </div>
                 <Switch
                   checked={settingsForm.showDept}
                   onCheckedChange={checked => setSettingsForm({...settingsForm, showDept: checked})}
                 />
               </div>
                <div className="space-y-2">
                  <Label>后台管理密码</Label>
                 <Input value={settingsForm.password} onChange={e => setSettingsForm({...settingsForm, password: e.target.value})} />
                 <p className="text-xs text-muted-foreground">建议设置为复杂的密码以防误入。</p>
               </div>
               <Button onClick={handleSaveSettings} className="w-full">保存设置</Button>
               <div className="mt-6 p-3 bg-muted/50 rounded-lg border text-xs text-muted-foreground">
                 <p className="font-medium mb-1">免责声明</p>
                 <p>本项目仅用于展示 AI 编程效果，开发者不对使用本项目产生的任何后果承担责任。使用者需自行承担使用风险。</p>
               </div>
            </TabsContent>
          </div>
        </Tabs>
      </main>

      <AlertDialog open={confirmFullReset} onOpenChange={setConfirmFullReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空数据库</AlertDialogTitle>
            <AlertDialogDescription>确定要清空所有人员数据吗？不可恢复！</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { fullReset(); toast.success("已清空数据库"); }}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingPerson ? "编辑人员" : "添加新人员"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">姓名</Label>
                    <Input className="col-span-3" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">部门</Label>
                    <Input className="col-span-3" value={editForm.dept} onChange={e => setEditForm({...editForm, dept: e.target.value})} />
                </div>
                {controlledModeUnlocked && (
                  <>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">权重</Label>
                        <Input type="number" className="col-span-3" value={editForm.weight} onChange={e => setEditForm({...editForm, weight: parseInt(e.target.value)||1})} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">内定奖项</Label>
                        <div className="col-span-3">
                            <Select value={editForm.mustWinPrizeId} onValueChange={v => setEditForm({...editForm, mustWinPrizeId: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择内定奖项（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">无 (公平抽取)</SelectItem>
                                    {prizes.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">奖项黑名单</Label>
                        <div className="col-span-3">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-between"
                                    >
                                        <span>
                                            {editForm.bannedPrizes.length === 0
                                                ? "选择禁止奖项..."
                                                : editForm.bannedPrizes.length === prizes.length
                                                ? "全选"
                                                : `已选择 ${editForm.bannedPrizes.length} 项`}
                                        </span>
                                        <span className="text-xs">▼</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="start">
                                    <div className="p-3 space-y-2 bg-zinc-950/95 border border-zinc-800 text-white rounded-lg backdrop-blur">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start h-8 text-xs hover:bg-zinc-800"
                                            onClick={() => {
                                                if (editForm.bannedPrizes.length === prizes.length) {
                                                    setEditForm({...editForm, bannedPrizes: []});
                                                } else {
                                                    setEditForm({...editForm, bannedPrizes: prizes.map(p => p.id)});
                                                }
                                            }}
                                        >
                                            {editForm.bannedPrizes.length === prizes.length ? "取消全选" : "全选"}
                                        </Button>
                                        <div className="border-t border-zinc-800 pt-2 space-y-1">
                                            {prizes.map(prize => (
                                                <div key={prize.id} className="flex items-center space-x-2 p-1.5 hover:bg-zinc-800 rounded">
                                                    <Checkbox
                                                        id={`banned-popover-${prize.id}`}
                                                        checked={editForm.bannedPrizes.includes(prize.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setEditForm({...editForm, bannedPrizes: [...editForm.bannedPrizes, prize.id]});
                                                            } else {
                                                                setEditForm({...editForm, bannedPrizes: editForm.bannedPrizes.filter(id => id !== prize.id)});
                                                            }
                                                        }}
                                                    />
                                                    <Label htmlFor={`banned-popover-${prize.id}`} className="text-sm cursor-pointer select-none text-zinc-300">{prize.name}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                  </>
                )}
            </div>
            <DialogFooter>
                <Button onClick={savePerson}>保存</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prize Edit/Add Dialog */}
      <Dialog open={isPrizeDialogOpen} onOpenChange={setIsPrizeDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingPrize ? "编辑奖项" : "添加新奖项"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">奖项名称</Label>
                    <Input className="col-span-3" placeholder="如：一等奖" value={prizeForm.name} onChange={e => setPrizeForm({...prizeForm, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">中奖人数</Label>
                    <Input
                      type="number"
                      min={1}
                      className="col-span-3"
                      placeholder="请输入中奖人数"
                      value={prizeForm.count}
                      onChange={e => setPrizeForm({
                        ...prizeForm,
                        count: e.target.value === '' ? '' : Number(e.target.value),
                      })}
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">奖品描述</Label>
                    <Textarea className="col-span-3" placeholder="如：iPhone 16 Pro Max 256GB" value={prizeForm.description} onChange={e => setPrizeForm({...prizeForm, description: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                    <Label className="text-right pt-2">奖品图片</Label>
                    <div className="col-span-3 space-y-2">
                      {prizeForm.image ? (
                        <div className="relative w-fit">
                          <img src={prizeForm.image} alt="奖品预览" className="h-28 w-44 rounded-lg border object-contain bg-muted p-1" />
                          <button
                            type="button"
                            onClick={() => setPrizeForm({...prizeForm, image: ""})}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center hover:bg-destructive/80"
                            aria-label="移除奖品图片"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">上传奖品图片</span>
                          <input type="file" accept="image/*" onChange={handlePrizeImageUpload} className="hidden" />
                        </label>
                      )}
                      <p className="text-xs text-muted-foreground">会同时展示在奖项页和抽奖大屏，大小不超过 800KB。</p>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button onClick={savePrize}>保存</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
