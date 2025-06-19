/**
 * FlexiSpot Serial Protocol Handler
 * Web Serial API を使用してFlexiSpotデスクとの通信を行う
 */

class FlexiSpotSerial {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.isMoving = false;
        this.continuousInterval = null;
        
        // シリアル通信設定
        this.baudRate = 9600;
        this.dataBits = 8;
        this.stopBits = 1;
        this.parity = 'none';
        
        // コマンド送信間隔（ms）
        this.commandInterval = 108;
        
        // コマンド定義
        this.commands = {
            UP: [0x9b, 0x06, 0x02, 0x01, 0x00, 0xfc, 0xa0, 0x9d],
            DOWN: [0x9b, 0x06, 0x02, 0x02, 0x00, 0x0c, 0xa0, 0x9d],
            PRESET1: [0x9b, 0x06, 0x02, 0x04, 0x00, 0xac, 0xa3, 0x9d],
            PRESET2: [0x9b, 0x06, 0x02, 0x08, 0x00, 0xac, 0xa6, 0x9d],
            SITTING: [0x9b, 0x06, 0x02, 0x00, 0x01, 0xac, 0x60, 0x9d],
            STANDING: [0x9b, 0x06, 0x02, 0x10, 0x00, 0xac, 0xac, 0x9d]
        };
        
        // イベントハンドラー
        this.onConnectionChange = null;
        this.onError = null;
        this.onStatusChange = null;
    }
    
    /**
     * Web Serial API の対応状況をチェック
     */
    static isSupported() {
        return 'serial' in navigator;
    }
    
    /**
     * HTTPS環境かどうかをチェック
     */
    static isSecureContext() {
        return window.isSecureContext;
    }
    
    /**
     * シリアルポートに接続
     */
    async connect() {
        try {
            // Web Serial API対応チェック
            if (!FlexiSpotSerial.isSupported()) {
                throw new Error('Web Serial APIがサポートされていません。Chrome/Edgeブラウザを使用してください。');
            }
            
            // HTTPS環境チェック
            if (!FlexiSpotSerial.isSecureContext()) {
                throw new Error('Web Serial APIはHTTPS環境でのみ動作します。');
            }
            
            // シリアルポートを選択
            this.port = await navigator.serial.requestPort();
            
            // ポートを開く
            await this.port.open({
                baudRate: this.baudRate,
                dataBits: this.dataBits,
                stopBits: this.stopBits,
                parity: this.parity
            });
            
            // リーダーとライターを取得
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            this.isConnected = true;
            
            // 接続状態変更イベントを発火
            if (this.onConnectionChange) {
                this.onConnectionChange(true);
            }
            
            // ステータス更新
            if (this.onStatusChange) {
                this.onStatusChange('FlexiSpotデスクに接続しました');
            }
            
            // 受信データの監視を開始
            this.startReading();
            
        } catch (error) {
            console.error('Connection error:', error);
            if (this.onError) {
                this.onError(error.message);
            }
            throw error;
        }
    }
      /**
     * シリアルポートから切断
     */
    async disconnect() {
        try {
            // 連続送信を停止
            this.stopContinuousCommand();
            
            // 接続状態を先に変更（読み取りループを停止）
            this.isConnected = false;
            this.isMoving = false;
            
            // 短い待機時間を設けて読み取り処理の完了を待つ
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // リーダーを安全に閉じる
            if (this.reader) {
                try {
                    await this.reader.cancel();
                } catch (cancelError) {
                    console.log('Reader cancel (expected):', cancelError.message);
                }
                
                try {
                    await this.reader.releaseLock();
                } catch (releaseError) {
                    console.log('Reader release (expected):', releaseError.message);
                }
                this.reader = null;
            }
            
            // ライターを安全に閉じる
            if (this.writer) {
                try {
                    await this.writer.releaseLock();
                } catch (releaseError) {
                    console.log('Writer release (expected):', releaseError.message);
                }
                this.writer = null;
            }
            
            // ポートを閉じる
            if (this.port) {
                try {
                    await this.port.close();
                } catch (closeError) {
                    console.log('Port close (expected):', closeError.message);
                }
                this.port = null;
            }
            
            // 接続状態変更イベントを発火
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
            
            // ステータス更新
            if (this.onStatusChange) {
                this.onStatusChange('FlexiSpotデスクから正常に切断しました');
            }
            
        } catch (error) {
            console.error('Disconnection error:', error);
            // Buffer overrunエラーの場合は詳細な情報を表示
            if (error.message.includes('Buffer overrun')) {
                if (this.onError) {
                    this.onError('バッファオーバーランが発生しました。データの受信が高速すぎる可能性があります。');
                }
            } else {
                if (this.onError) {
                    this.onError('切断エラー: ' + error.message);
                }
            }
        }
    }
      /**
     * 受信データの監視を開始
     */
    async startReading() {
        try {
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                // 受信データの処理（バッファオーバーラン対策）
                if (value && value.length > 0) {
                    console.log('Received:', Array.from(value));
                    // 受信データを即座に処理してバッファをクリア
                    this.processReceivedData(value);
                }
                
                // 短い間隔で次の読み取りを行う
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        } catch (error) {
            // 切断時の正常なエラーは無視
            if (this.isConnected && !error.message.includes('canceled')) {
                console.error('Reading error:', error);
                if (this.onError) {
                    this.onError('受信エラー: ' + error.message);
                }
            }
        }
    }
    
    /**
     * 受信データを処理
     */
    processReceivedData(data) {
        // FlexiSpotからの応答データの処理
        // 高さ情報や状態情報が含まれる場合があります
        const dataArray = Array.from(data);
        
        // データ長が適切かチェック
        if (dataArray.length >= 8) {
            // FlexiSpotの標準応答パケット形式をチェック
            if (dataArray[0] === 0x9b && dataArray[1] === 0x06) {
                // 高さ情報の処理（例：バイト4-5が高さデータ）
                const height = (dataArray[4] << 8) | dataArray[5];
                console.log('Desk height:', height);
                
                // 状態変更の通知
                if (this.onStatusChange) {
                    this.onStatusChange(`デスク高さ: ${height / 10}cm`);
                }
            }
        }
    }
    
    /**
     * コマンドを送信
     */
    async sendCommand(commandName) {
        if (!this.isConnected || !this.writer) {
            throw new Error('デスクに接続されていません');
        }
        
        const command = this.commands[commandName];
        if (!command) {
            throw new Error(`未知のコマンド: ${commandName}`);
        }
        
        try {
            const data = new Uint8Array(command);
            await this.writer.write(data);
            console.log(`Command sent: ${commandName}`, command);
        } catch (error) {
            console.error('Send command error:', error);
            if (this.onError) {
                this.onError('コマンド送信エラー: ' + error.message);
            }
            throw error;
        }
    }
    
    /**
     * 連続コマンド送信を開始（UP/DOWN用）
     */
    startContinuousCommand(commandName) {
        if (this.continuousInterval) {
            this.stopContinuousCommand();
        }
        
        this.isMoving = true;
        
        // 即座に最初のコマンドを送信
        this.sendCommand(commandName).catch(error => {
            console.error('Initial command failed:', error);
            this.stopContinuousCommand();
        });
        
        // 定期的にコマンドを送信
        this.continuousInterval = setInterval(() => {
            this.sendCommand(commandName).catch(error => {
                console.error('Continuous command failed:', error);
                this.stopContinuousCommand();
            });
        }, this.commandInterval);
        
        // ステータス更新
        if (this.onStatusChange) {
            const action = commandName === 'UP' ? '上昇' : '下降';
            this.onStatusChange(`デスクを${action}中...`);
        }
    }
      /**
     * 連続コマンド送信を停止
     */
    stopContinuousCommand() {
        if (this.continuousInterval) {
            clearInterval(this.continuousInterval);
            this.continuousInterval = null;
        }
        
        this.isMoving = false;
        
        // ステータス更新
        if (this.onStatusChange) {
            this.onStatusChange('デスクの動作を停止しました');
        }
        
        // バッファクリアを促進
        this.clearReceiveBuffer();
    }
    
    /**
     * 受信バッファをクリア（Buffer overrun対策）
     */
    async clearReceiveBuffer() {
        if (!this.reader || !this.isConnected) return;
        
        try {
            // 短時間で残存データを読み取り、破棄
            const timeout = setTimeout(() => {}, 50); // 50ms timeout
            
            while (this.isConnected && this.reader) {
                const { value, done } = await Promise.race([
                    this.reader.read(),
                    new Promise(resolve => setTimeout(() => resolve({ done: true }), 50))
                ]);
                
                if (done || !value || value.length === 0) break;
                
                // データを読み取って破棄（ログ出力のみ）
                console.log('Buffer cleared:', Array.from(value));
            }
            
            clearTimeout(timeout);
        } catch (error) {
            // バッファクリア中のエラーは無視
            console.log('Buffer clear completed:', error.message);
        }
    }
    
    /**
     * プリセットコマンドを送信
     */
    async sendPresetCommand(presetName) {
        try {
            await this.sendCommand(presetName);
            
            // ステータス更新
            if (this.onStatusChange) {
                const presetNames = {
                    PRESET1: 'プリセット1',
                    PRESET2: 'プリセット2',
                    SITTING: 'シッティング',
                    STANDING: 'スタンド'
                };
                this.onStatusChange(`${presetNames[presetName]}位置へ移動中...`);
            }
            
        } catch (error) {
            console.error('Preset command error:', error);
            throw error;
        }
    }
    
    /**
     * 接続状態を取得
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            isMoving: this.isMoving
        };
    }
    
    /**
     * 接続状態変更のイベントハンドラーを設定
     */
    setConnectionChangeHandler(handler) {
        this.onConnectionChange = handler;
    }
    
    /**
     * エラーのイベントハンドラーを設定
     */
    setErrorHandler(handler) {
        this.onError = handler;
    }
    
    /**
     * ステータス変更のイベントハンドラーを設定
     */
    setStatusChangeHandler(handler) {
        this.onStatusChange = handler;
    }
}

// グローバルに公開
window.FlexiSpotSerial = FlexiSpotSerial;
