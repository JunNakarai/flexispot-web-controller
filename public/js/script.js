/**
 * FlexiSpot Web Controller - Main Script
 * UIの制御とシリアル通信の統合
 */

class FlexiSpotController {
    constructor() {
        // バージョン情報
        this.version = '1.1.0';
        this.buildDate = '2025-06-18';
        
        this.serial = new FlexiSpotSerial();
        this.presets = this.loadPresets();
        this.activePresets = new Set(); // 動作中のプリセットを追跡
        
        this.initializeElements();
        this.attachEventListeners();
        this.setupSerialHandlers();
        this.updateUI();
        this.displayVersionInfo();
    }
    
    /**
     * DOM要素を初期化
     */
    initializeElements() {
        // 接続関連
        this.connectionStatus = document.getElementById('connection-status');
        this.connectionText = document.getElementById('connection-text');
        this.connectBtn = document.getElementById('connect-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        
        // プリセットボタン
        this.preset1Btn = document.getElementById('preset1-btn');
        this.preset2Btn = document.getElementById('preset2-btn');
        this.sittingBtn = document.getElementById('sitting-btn');
        this.standingBtn = document.getElementById('standing-btn');
        
        // 手動制御ボタン
        this.upBtn = document.getElementById('up-btn');
        this.downBtn = document.getElementById('down-btn');
        
        // ステータス表示
        this.statusMessage = document.getElementById('status-message');
        
        // エラーモーダル
        this.errorModal = document.getElementById('error-modal');
        this.errorMessage = document.getElementById('error-message');
        this.errorCloseBtn = document.getElementById('error-close-btn');
    }
    
    /**
     * イベントリスナーを設定
     */
    attachEventListeners() {
        // 接続ボタン
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.disconnectBtn.addEventListener('click', () => this.handleDisconnect());
        
        // プリセットボタン
        this.preset1Btn.addEventListener('click', () => this.handlePreset('PRESET1', 'preset1-btn'));
        this.preset2Btn.addEventListener('click', () => this.handlePreset('PRESET2', 'preset2-btn'));
        this.sittingBtn.addEventListener('click', () => this.handlePreset('SITTING', 'sitting-btn'));
        this.standingBtn.addEventListener('click', () => this.handlePreset('STANDING', 'standing-btn'));
        
        // UP/DOWNボタン（マウスイベント）
        this.setupManualControls();
        
        // エラーモーダル
        this.errorCloseBtn.addEventListener('click', () => this.hideErrorModal());
        this.errorModal.addEventListener('click', (e) => {
            if (e.target === this.errorModal) {
                this.hideErrorModal();
            }
        });
        
        // キーボードショートカット
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // ページ離脱時の処理
        window.addEventListener('beforeunload', () => {
            if (this.serial.isConnected) {
                this.serial.disconnect();
            }
        });
    }
    
    /**
     * 手動制御ボタンのイベント設定
     */
    setupManualControls() {
        // UPボタン
        this.upBtn.addEventListener('mousedown', () => this.startManualControl('UP'));
        this.upBtn.addEventListener('mouseup', () => this.stopManualControl());
        this.upBtn.addEventListener('mouseleave', () => this.stopManualControl());
        this.upBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startManualControl('UP');
        });
        this.upBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopManualControl();
        });
        
        // DOWNボタン
        this.downBtn.addEventListener('mousedown', () => this.startManualControl('DOWN'));
        this.downBtn.addEventListener('mouseup', () => this.stopManualControl());
        this.downBtn.addEventListener('mouseleave', () => this.stopManualControl());
        this.downBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startManualControl('DOWN');
        });
        this.downBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopManualControl();
        });
    }
    
    /**
     * シリアル通信のハンドラーを設定
     */
    setupSerialHandlers() {
        this.serial.setConnectionChangeHandler((isConnected) => {
            this.updateConnectionStatus(isConnected);
        });
        
        this.serial.setErrorHandler((error) => {
            this.showError(error);
        });
        
        this.serial.setStatusChangeHandler((status) => {
            this.updateStatus(status);
        });
    }
    
    /**
     * 接続処理
     */
    async handleConnect() {
        try {
            this.connectBtn.classList.add('loading');
            this.connectBtn.disabled = true;
            
            await this.serial.connect();
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.showError(error.message);
        } finally {
            this.connectBtn.classList.remove('loading');
            this.connectBtn.disabled = false;
        }
    }
    
    /**
     * 切断処理
     */
    async handleDisconnect() {
        try {
            this.disconnectBtn.classList.add('loading');
            this.disconnectBtn.disabled = true;
            
            await this.serial.disconnect();
            
        } catch (error) {
            console.error('Disconnection failed:', error);
            this.showError(error.message);
        } finally {
            this.disconnectBtn.classList.remove('loading');
            this.disconnectBtn.disabled = false;
        }
    }
    
    /**
     * プリセット処理
     */
    async handlePreset(command, buttonId) {
        if (!this.serial.isConnected) {
            this.showError('デスクに接続されていません');
            return;
        }
        
        const button = document.getElementById(buttonId);
        
        try {
            // すでに動作中の場合は停止
            if (this.activePresets.has(buttonId)) {
                await this.serial.sendPresetCommand(command); // 停止コマンド送信
                this.activePresets.delete(buttonId);
                button.classList.remove('active');
                this.updateStatus('プリセット動作を停止しました');
                return;
            }
            
            // 新しいプリセット動作を開始
            await this.serial.sendPresetCommand(command);
            this.activePresets.add(buttonId);
            button.classList.add('active');
            
            // 一定時間後に自動的に停止状態にする（実際の動作完了を想定）
            setTimeout(() => {
                if (this.activePresets.has(buttonId)) {
                    this.activePresets.delete(buttonId);
                    button.classList.remove('active');
                    this.updateStatus('プリセット位置への移動が完了しました');
                }
            }, 10000); // 10秒後に自動停止
            
        } catch (error) {
            console.error('Preset command failed:', error);
            this.showError(error.message);
            this.activePresets.delete(buttonId);
            button.classList.remove('active');
        }
    }
    
    /**
     * 手動制御開始
     */
    startManualControl(direction) {
        if (!this.serial.isConnected) {
            this.showError('デスクに接続されていません');
            return;
        }
        
        const button = direction === 'UP' ? this.upBtn : this.downBtn;
        button.classList.add('active');
        
        this.serial.startContinuousCommand(direction);
    }
    
    /**
     * 手動制御停止
     */
    stopManualControl() {
        this.upBtn.classList.remove('active');
        this.downBtn.classList.remove('active');
        
        this.serial.stopContinuousCommand();
    }
    
    /**
     * キーボードイベント処理
     */
    handleKeyDown(e) {
        if (!this.serial.isConnected) return;
        
        switch(e.code) {
            case 'ArrowUp':
                e.preventDefault();
                if (!this.upBtn.classList.contains('active')) {
                    this.startManualControl('UP');
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (!this.downBtn.classList.contains('active')) {
                    this.startManualControl('DOWN');
                }
                break;
            case 'Digit1':
                e.preventDefault();
                this.handlePreset('PRESET1', 'preset1-btn');
                break;
            case 'Digit2':
                e.preventDefault();
                this.handlePreset('PRESET2', 'preset2-btn');
                break;
            case 'KeyS':
                e.preventDefault();
                this.handlePreset('SITTING', 'sitting-btn');
                break;
            case 'KeyT':
                e.preventDefault();
                this.handlePreset('STANDING', 'standing-btn');
                break;
        }
    }
    
    /**
     * キーボードイベント処理（キーアップ）
     */
    handleKeyUp(e) {
        switch(e.code) {
            case 'ArrowUp':
            case 'ArrowDown':
                e.preventDefault();
                this.stopManualControl();
                break;
        }
    }
    
    /**
     * 接続状態の更新
     */
    updateConnectionStatus(isConnected) {
        if (isConnected) {
            this.connectionStatus.className = 'status-dot connected';
            this.connectionText.textContent = 'Connected';
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;
        } else {
            this.connectionStatus.className = 'status-dot disconnected';
            this.connectionText.textContent = '未接続';
            this.connectBtn.disabled = false;
            this.disconnectBtn.disabled = true;
            
            // アクティブ状態をリセット
            this.activePresets.clear();
            document.querySelectorAll('.btn-preset').forEach(btn => {
                btn.classList.remove('active');
            });
            this.upBtn.classList.remove('active');
            this.downBtn.classList.remove('active');
        }
        
        this.updateControlButtonsState();
    }
    
    /**
     * 制御ボタンの状態を更新
     */
    updateControlButtonsState() {
        const isConnected = this.serial.isConnected;
        
        // プリセットボタン
        this.preset1Btn.disabled = !isConnected;
        this.preset2Btn.disabled = !isConnected;
        this.sittingBtn.disabled = !isConnected;
        this.standingBtn.disabled = !isConnected;
        
        // 手動制御ボタン
        this.upBtn.disabled = !isConnected;
        this.downBtn.disabled = !isConnected;
    }
    
    /**
     * ステータスメッセージの更新
     */
    updateStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'status-message';
        
        if (type === 'error') {
            this.statusMessage.classList.add('error');
        } else if (type === 'success') {
            this.statusMessage.classList.add('success');
        }
    }
    
    /**
     * エラーモーダルの表示
     */
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorModal.classList.remove('hidden');
        this.updateStatus(message, 'error');
    }
    
    /**
     * エラーモーダルの非表示
     */
    hideErrorModal() {
        this.errorModal.classList.add('hidden');
    }
    
    /**
     * プリセット設定の読み込み
     */
    loadPresets() {
        const defaultPresets = {
            preset1: 70,
            preset2: 110,
            sitting: 75,
            standing: 115
        };
        
        try {
            const saved = localStorage.getItem('flexispot-presets');
            return saved ? { ...defaultPresets, ...JSON.parse(saved) } : defaultPresets;
        } catch (error) {
            console.error('Failed to load presets:', error);
            return defaultPresets;
        }
    }
    
    /**
     * プリセット設定の保存
     */
    savePresets() {
        try {
            localStorage.setItem('flexispot-presets', JSON.stringify(this.presets));
        } catch (error) {
            console.error('Failed to save presets:', error);
        }
    }
      /**
     * UIの初期化
     */
    updateUI() {
        this.updateConnectionStatus(false);
        
        // 初期ステータスメッセージ
        let message = 'Web Serial APIを使用してFlexiSpotデスクを制御します。';
        
        if (!FlexiSpotSerial.isSupported()) {
            message += '<br>⚠️ Web Serial APIがサポートされていません。Chrome/Edgeブラウザを使用してください。';
            this.connectBtn.disabled = true;
        } else if (!FlexiSpotSerial.isSecureContext()) {
            message += '<br>⚠️ HTTPS環境が必要です。';
            this.connectBtn.disabled = true;
        } else {
            message += '<br>「接続」ボタンを押してデスクに接続してください。';
        }
        
        this.statusMessage.innerHTML = message;
        
        // キーボードショートカットの説明を追加
        const shortcutInfo = document.createElement('div');
        shortcutInfo.style.marginTop = '1rem';
        shortcutInfo.style.fontSize = '0.75rem';
        shortcutInfo.style.color = '#718096';
        shortcutInfo.innerHTML = `
            <strong>キーボードショートカット:</strong><br>
            ↑↓: UP/DOWN制御 | 1,2: プリセット1,2 | S: シッティング | T: スタンド
        `;
        this.statusMessage.appendChild(shortcutInfo);
    }
    
    /**
     * バージョン情報を表示
     */
    displayVersionInfo() {
        const versionElement = document.getElementById('version');
        const buildDateElements = document.querySelectorAll('.build-date');
        
        if (versionElement) {
            versionElement.textContent = `v${this.version}`;
        }
        
        buildDateElements.forEach(element => {
            element.textContent = `Build: ${this.buildDate}`;
        });
        
        // コンソールにもバージョン情報を出力
        console.log(`%cFlexiSpot Controller v${this.version}`, 'color: #4299e1; font-weight: bold; font-size: 14px;');
        console.log(`Build Date: ${this.buildDate}`);
        console.log('Buffer overrun fix applied');
    }
}

// DOM読み込み完了後にコントローラーを初期化
document.addEventListener('DOMContentLoaded', () => {
    window.controller = new FlexiSpotController();
});
