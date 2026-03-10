#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  RealSync Training Monitor
#  Live dashboard for Emotion model retraining
#  Supports EfficientNet-B2 / MobileNetV2 with Zoom augmentation
# ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Use the most recent active log file
# Priority: finetune (latest) > b2 > original
if [[ -f "/tmp/training_emotion_finetune.log" ]]; then
    EMOTION_LOG="/tmp/training_emotion_finetune.log"
elif [[ -f "${BASE_DIR}/training_emotion_b2.log" ]]; then
    EMOTION_LOG="${BASE_DIR}/training_emotion_b2.log"
else
    EMOTION_LOG="${BASE_DIR}/training_emotion.log"
fi

REFRESH=2  # seconds

# ── Colors ───────────────────────────────────────────────
RST="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
RED="\033[31m"
MAGENTA="\033[35m"
BOLD_GREEN="\033[1;32m"
BOLD_YELLOW="\033[1;33m"
BOLD_RED="\033[1;31m"
BOLD_WHITE="\033[1;97m"
BOLD_CYAN="\033[1;36m"
BOLD_MAGENTA="\033[1;35m"
BG_GREEN="\033[42m"
BG_RED="\033[41m"
BG_YELLOW="\033[43m"

# Dashboard width
W=64

# ── Helpers ──────────────────────────────────────────────

hline() {
    local left="$1" fill="$2" right="$3"
    printf "%b%s" "$CYAN" "$left"
    for ((i = 0; i < W; i++)); do printf "%s" "$fill"; done
    printf "%s%b\n" "$right" "$RST"
}

row() {
    printf "%b║%b %b" "$CYAN" "$RST" "${1:-}"
    printf "\033[%dG%b║%b\n" "$((W + 3))" "$CYAN" "$RST"
}

row_empty() {
    printf "%b║%b" "$CYAN" "$RST"
    printf "\033[%dG%b║%b\n" "$((W + 3))" "$CYAN" "$RST"
}

progress_bar() {
    local current="${1:-0}" total="${2:-0}" width="${3:-30}"
    if ((total <= 0)); then
        printf "["
        for ((i = 0; i < width; i++)); do printf "░"; done
        printf "]  0%%"
        return
    fi
    local pct=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    printf "[%b" "$GREEN"
    for ((i = 0; i < filled; i++)); do printf "█"; done
    printf "%b" "$DIM"
    for ((i = 0; i < empty; i++)); do printf "░"; done
    printf "%b] %3d%%" "$RST" "$pct"
}

color_loss() {
    local val="${1:---}"
    if [[ "$val" == "--" ]]; then printf "%b  --%b" "$DIM" "$RST"; return; fi
    local int_part
    int_part=$(awk "BEGIN {printf \"%d\", $val * 1000}")
    if ((int_part < 300)); then
        printf "%b%s%b" "$BOLD_GREEN" "$val" "$RST"
    elif ((int_part < 800)); then
        printf "%b%s%b" "$BOLD_YELLOW" "$val" "$RST"
    else
        printf "%b%s%b" "$BOLD_RED" "$val" "$RST"
    fi
}

color_acc() {
    local val="${1:---}"
    if [[ "$val" == "--" ]]; then printf "%b  --%b" "$DIM" "$RST"; return; fi
    local pct
    pct=$(awk "BEGIN {printf \"%d\", $val * 100}")
    if ((pct >= 60)); then
        printf "%b%s%b" "$BOLD_GREEN" "$val" "$RST"
    elif ((pct >= 45)); then
        printf "%b%s%b" "$BOLD_YELLOW" "$val" "$RST"
    else
        printf "%b%s%b" "$BOLD_RED" "$val" "$RST"
    fi
}

trend_arrow() {
    local prev="${1:---}" curr="${2:---}" mode="${3:-higher_better}"
    if [[ "$prev" == "--" || "$curr" == "--" ]]; then printf " "; return; fi
    local cmp
    cmp=$(awk "BEGIN {print ($curr > $prev) ? 1 : ($curr < $prev) ? -1 : 0}")
    if [[ "$mode" == "higher_better" ]]; then
        case "$cmp" in
            1)  printf "%b↑%b" "$GREEN" "$RST" ;;
            -1) printf "%b↓%b" "$RED" "$RST" ;;
            *)  printf "%b→%b" "$DIM" "$RST" ;;
        esac
    else
        case "$cmp" in
            -1) printf "%b↓%b" "$GREEN" "$RST" ;;
            1)  printf "%b↑%b" "$RED" "$RST" ;;
            *)  printf "%b→%b" "$DIM" "$RST" ;;
        esac
    fi
}

check_process() {
    if pgrep -f "$1" > /dev/null 2>&1; then
        printf "%b RUNNING %b" "$BG_GREEN" "$RST"
    else
        # Check if training completed
        if [[ -f "$EMOTION_LOG" ]] && grep -q "Final Evaluation" "$EMOTION_LOG" 2>/dev/null; then
            printf "%b COMPLETE %b" "$BG_GREEN" "$RST"
        elif [[ -f "$EMOTION_LOG" ]] && grep -q "Early stopping" "$EMOTION_LOG" 2>/dev/null; then
            printf "%b EARLY STOP %b" "$BG_YELLOW" "$RST"
        else
            printf "%b STOPPED %b" "$BG_RED" "$RST"
        fi
    fi
}

fmt_time() {
    local secs="${1:-0}"
    if ((secs < 60)); then
        printf "%ds" "$secs"
    elif ((secs < 3600)); then
        printf "%dm %ds" "$((secs / 60))" "$((secs % 60))"
    else
        printf "%dh %dm" "$((secs / 3600))" "$(((secs % 3600) / 60))"
    fi
}

# ── Log Parser ──────────────────────────────────────────

parse_emotion() {
    E_EPOCH=0; E_TOTAL=20; E_TLOSS="--"; E_TACC="--"
    E_VLOSS="--"; E_VACC="--"; E_LR="--"
    E_BATCH=0; E_BATCH_TOTAL=0; E_BEST_ACC="--"
    E_PREV_VLOSS="--"; E_PREV_VACC="--"
    E_RESUMED="--"; E_ZOOM_AUG="--"
    E_TRAIN_SIZE="--"; E_VAL_SIZE="--"
    E_DATASETS=""

    [[ -f "$EMOTION_LOG" ]] || return 0

    # Config info
    local epochs_line
    epochs_line=$(grep "^Epochs:" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$epochs_line" ]]; then
        E_TOTAL=$(echo "$epochs_line" | sed -E 's/Epochs: ([0-9]+).*/\1/')
    fi

    local zoom_line
    zoom_line=$(grep "^Zoom augmentation:" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$zoom_line" ]]; then
        E_ZOOM_AUG=$(echo "$zoom_line" | sed -E 's/Zoom augmentation: (.*)/\1/')
    fi

    local resume_line
    resume_line=$(grep "^Resuming from:" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$resume_line" ]]; then
        E_RESUMED="yes"
    fi

    # Dataset sizes
    local total_line
    total_line=$(grep "^Total train:" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$total_line" ]]; then
        E_TRAIN_SIZE=$(echo "$total_line" | sed -E 's/Total train: ([0-9]+).*/\1/')
        E_VAL_SIZE=$(echo "$total_line" | sed -E 's/.*Val: ([0-9]+).*/\1/')
    fi

    # Check which datasets loaded
    if grep -q "FER2013 train:" "$EMOTION_LOG" 2>/dev/null; then
        E_DATASETS="FER2013"
    fi
    if grep -q "AffectNet Train:" "$EMOTION_LOG" 2>/dev/null; then
        E_DATASETS="${E_DATASETS}+AffectNet"
    fi

    # Loaded checkpoint info
    local ckpt_line
    ckpt_line=$(grep "^Loaded checkpoint:" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$ckpt_line" ]]; then
        E_RESUMED=$(echo "$ckpt_line" | sed -E 's/.*val_acc ([0-9.]+).*/\1/')
    fi

    # Last two epoch summaries for trend comparison
    local summaries last prev
    summaries=$(grep -E "^Epoch [0-9]+/[0-9]+ \|" "$EMOTION_LOG" 2>/dev/null | tail -2) || true
    last=$(echo "$summaries" | tail -1)
    prev=$(echo "$summaries" | head -1)

    if [[ -n "$last" ]]; then
        E_EPOCH=$(echo "$last" | sed -E 's/Epoch ([0-9]+)\/.*/\1/')
        E_TOTAL=$(echo "$last" | sed -E 's/Epoch [0-9]+\/([0-9]+).*/\1/')
        E_TLOSS=$(echo "$last" | sed -E 's/.*Train Loss: ([0-9.]+).*/\1/')
        E_TACC=$(echo "$last" | sed -E 's/.*Acc: ([0-9.]+).*/\1/')
        E_VLOSS=$(echo "$last" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        E_VACC=$(echo "$last" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        E_LR=$(echo "$last" | sed -E 's/.*LR: ([0-9.]+).*/\1/')
    fi

    # Trend from previous epoch
    if [[ -n "$prev" && "$prev" != "$last" ]]; then
        E_PREV_VLOSS=$(echo "$prev" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        E_PREV_VACC=$(echo "$prev" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
    fi

    # Batch progress within current epoch
    local last_batch
    last_batch=$(grep -E "Epoch [0-9]+ \| Batch" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$last_batch" ]]; then
        local b_epoch b_num b_total
        b_epoch=$(echo "$last_batch" | sed -E 's/.*Epoch ([0-9]+).*/\1/')
        b_num=$(echo "$last_batch" | sed -E 's/.*Batch ([0-9]+)\/.*/\1/')
        b_total=$(echo "$last_batch" | sed -E 's/.*Batch [0-9]+\/([0-9]+).*/\1/')
        if ((b_epoch > E_EPOCH)); then
            E_BATCH=$b_num
            E_BATCH_TOTAL=$b_total
            E_EPOCH=$b_epoch
        fi
    fi

    # Best checkpoint
    local best
    best=$(grep "Saved best" "$EMOTION_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$best" ]]; then
        E_BEST_ACC=$(echo "$best" | sed -E 's/.*val_acc: ([0-9.]+).*/\1/')
    fi
}

estimate_eta() {
    local log_file="$1" current_epoch="$2" total_epochs="$3"
    if [[ ! -f "$log_file" ]] || ((current_epoch <= 0 || current_epoch >= total_epochs)); then
        printf "--"
        return
    fi

    local completed now file_birth elapsed
    completed=$(grep -c -E "^Epoch [0-9]+/[0-9]+ \|" "$log_file" 2>/dev/null) || true
    if ((completed < 1)); then
        printf "calculating..."
        return
    fi

    now=$(date +%s)
    file_birth=$(stat -f %B "$log_file" 2>/dev/null) || true
    if [[ -n "$file_birth" && "$file_birth" != "0" ]]; then
        elapsed=$((now - file_birth))
        ((elapsed > 30)) && elapsed=$((elapsed - 30))  # subtract data loading time
        local secs_per_epoch=$((elapsed / completed))
        local remaining=$((total_epochs - current_epoch))
        local eta_secs=$((secs_per_epoch * remaining))
        printf "~%s (%s/epoch)" "$(fmt_time $eta_secs)" "$(fmt_time $secs_per_epoch)"
    else
        printf "calculating..."
    fi
}

elapsed_time() {
    local log_file="$1"
    [[ -f "$log_file" ]] || { printf "--"; return; }
    local now file_birth
    now=$(date +%s)
    file_birth=$(stat -f %B "$log_file" 2>/dev/null) || true
    if [[ -n "$file_birth" && "$file_birth" != "0" ]]; then
        local elapsed=$((now - file_birth))
        fmt_time "$elapsed"
    else
        printf "--"
    fi
}

# ── Sparkline (last N val accuracies) ─────────────────────

sparkline() {
    local log_file="$1"
    local chars=("▁" "▂" "▃" "▄" "▅" "▆" "▇" "█")
    local vals=()

    [[ -f "$log_file" ]] || { printf "--"; return; }

    while IFS= read -r line; do
        local v
        v=$(echo "$line" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        vals+=("$v")
    done < <(grep -E "^Epoch [0-9]+/[0-9]+ \|" "$log_file" 2>/dev/null | tail -20)

    if ((${#vals[@]} < 2)); then
        printf "%bwaiting...%b" "$DIM" "$RST"
        return
    fi

    # Find min/max for scaling
    local min_v=1.0 max_v=0.0
    for v in "${vals[@]}"; do
        local is_min is_max
        is_min=$(awk "BEGIN {print ($v < $min_v) ? 1 : 0}")
        is_max=$(awk "BEGIN {print ($v > $max_v) ? 1 : 0}")
        ((is_min)) && min_v="$v"
        ((is_max)) && max_v="$v"
    done

    local range
    range=$(awk "BEGIN {r=$max_v - $min_v; print (r < 0.001) ? 0.001 : r}")

    printf "%b" "$GREEN"
    for v in "${vals[@]}"; do
        local idx
        idx=$(awk "BEGIN {i=int(($v - $min_v) / $range * 7); if(i>7) i=7; if(i<0) i=0; print i}")
        printf "%s" "${chars[$idx]}"
    done
    printf "%b" "$RST"
}

# ── Per-class accuracy (from final eval or last report) ──

parse_class_report() {
    [[ -f "$EMOTION_LOG" ]] || return 0

    # Check if classification report exists in log
    local has_report
    has_report=$(grep -c "precision    recall" "$EMOTION_LOG" 2>/dev/null) || true
    ((has_report > 0)) || return 0

    # Parse the 7 emotion lines from the last classification report
    local in_report=0
    while IFS= read -r line; do
        if echo "$line" | grep -q "precision    recall"; then
            in_report=1
            continue
        fi
        if ((in_report)) && echo "$line" | grep -qE "^\s+(angry|disgust|fear|happy|sad|surprise|neutral)"; then
            local cls f1
            cls=$(echo "$line" | awk '{print $1}')
            f1=$(echo "$line" | awk '{print $4}')
            printf "  %-10s %s  " "$cls" "$(color_acc "$f1")"
        fi
        if echo "$line" | grep -q "accuracy"; then
            in_report=0
        fi
    done < "$EMOTION_LOG"
}

# ── Render ───────────────────────────────────────────────

render() {
    printf "\033[H\033[J"

    parse_emotion

    local now elapsed
    now=$(date "+%H:%M:%S")
    elapsed=$(elapsed_time "$EMOTION_LOG")

    local status
    status=$(check_process "train_emotion")

    # Header
    hline "╔" "═" "╗"
    row "$(printf "%b%b     ⚡ RealSync Training Monitor ⚡         %b" "$BOLD" "$CYAN" "$RST")"
    row "$(printf "%b        %s  │  Elapsed: %s            %b" "$DIM" "$now" "$elapsed" "$RST")"
    hline "╠" "═" "╣"

    # Model header
    # Auto-detect backbone from log
    local backbone
    backbone=$(grep -m1 "^Backbone:" "$EMOTION_LOG" 2>/dev/null | awk '{print $2}')
    [[ -z "$backbone" ]] && backbone="MobileNetV2"
    row "$(printf "%b  EMOTION MODEL (%s)%b          %s" "$BOLD_WHITE" "$backbone" "$RST" "$status")"
    row_empty

    # Config info
    if [[ "$E_ZOOM_AUG" != "--" ]]; then
        local aug_badge
        if [[ "$E_ZOOM_AUG" == "True" ]]; then
            aug_badge=$(printf "%b ZOOM AUG ON %b" "$BG_GREEN" "$RST")
        else
            aug_badge=$(printf "%b ZOOM AUG OFF %b" "$BG_YELLOW" "$RST")
        fi
        local warm_badge=""
        if [[ "$E_RESUMED" != "--" ]]; then
            warm_badge=$(printf "  %b WARM START %b" "$BG_GREEN" "$RST")
        fi
        local unfreeze_badge=""
        if grep -q "All layers unfrozen" "$EMOTION_LOG" 2>/dev/null; then
            unfreeze_badge=$(printf "  %b FULL UNFREEZE %b" "$BG_GREEN" "$RST")
        fi
        row "$(printf "  %s%s%s  %b%s%b" "$aug_badge" "$warm_badge" "$unfreeze_badge" "$DIM" "${E_DATASETS}" "$RST")"
        row_empty
    fi

    # Dataset info
    if [[ "$E_TRAIN_SIZE" != "--" ]]; then
        row "$(printf "  %bDataset:%b  Train: %b%s%b  │  Val: %b%s%b images" "$DIM" "$RST" "$BOLD_WHITE" "$E_TRAIN_SIZE" "$RST" "$BOLD_WHITE" "$E_VAL_SIZE" "$RST")"
    fi

    # Epoch progress
    local bar
    bar=$(progress_bar "$E_EPOCH" "$E_TOTAL" 30)
    row "$(printf "  Epoch:   %b%d / %d%b   %s" "$BOLD_WHITE" "$E_EPOCH" "$E_TOTAL" "$RST" "$bar")"

    # Batch progress (if mid-epoch)
    if ((E_BATCH > 0 && E_BATCH_TOTAL > 0)); then
        local b_bar
        b_bar=$(progress_bar "$E_BATCH" "$E_BATCH_TOTAL" 24)
        row "$(printf "  Batch:   %d / %d    %s" "$E_BATCH" "$E_BATCH_TOTAL" "$b_bar")"
    fi

    row_empty

    # Metrics header
    row "$(printf "  %b┌─────────────┬────────────┬────────────┐%b" "$DIM" "$RST")"
    row "$(printf "  %b│%b   Metric    %b│%b   Train    %b│%b    Val     %b│%b" "$DIM" "$RST" "$DIM" "$RST" "$DIM" "$RST" "$DIM" "$RST")"
    row "$(printf "  %b├─────────────┼────────────┼────────────┤%b" "$DIM" "$RST")"

    # Loss row
    local vl_trend
    vl_trend=$(trend_arrow "$E_PREV_VLOSS" "$E_VLOSS" "lower_better")
    row "$(printf "  %b│%b Loss        %b│%b %s    %b│%b %s %s  %b│%b" "$DIM" "$RST" "$DIM" "$RST" "$(color_loss "$E_TLOSS")" "$DIM" "$RST" "$(color_loss "$E_VLOSS")" "$vl_trend" "$DIM" "$RST")"

    # Accuracy row
    local va_trend
    va_trend=$(trend_arrow "$E_PREV_VACC" "$E_VACC" "higher_better")
    row "$(printf "  %b│%b Accuracy    %b│%b %s    %b│%b %s %s  %b│%b" "$DIM" "$RST" "$DIM" "$RST" "$(color_acc "$E_TACC")" "$DIM" "$RST" "$(color_acc "$E_VACC")" "$va_trend" "$DIM" "$RST")"

    row "$(printf "  %b└─────────────┴────────────┴────────────┘%b" "$DIM" "$RST")"
    row_empty

    # LR + ETA
    local eta
    eta=$(estimate_eta "$EMOTION_LOG" "$E_EPOCH" "$E_TOTAL")
    row "$(printf "  LR: %b%s%b    ETA: %b%s%b" "$DIM" "$E_LR" "$RST" "$BOLD_WHITE" "$eta" "$RST")"

    # Best checkpoint
    if [[ "$E_BEST_ACC" != "--" ]]; then
        local best_pct
        best_pct=$(awk "BEGIN {printf \"%.2f%%\", $E_BEST_ACC * 100}")
        local star=""
        if [[ "$E_VACC" == "$E_BEST_ACC" ]]; then
            star=$(printf " %b★ NEW BEST%b" "$BOLD_GREEN" "$RST")
        fi
        row "$(printf "  Best:  %b%s%b val accuracy%s" "$BOLD_GREEN" "$best_pct" "$RST" "$star")"
    fi

    # Sparkline
    row_empty
    row "$(printf "  Val Accuracy Trend: %s" "$(sparkline "$EMOTION_LOG")")"

    # Class-level F1 (only after final evaluation)
    if grep -q "precision    recall" "$EMOTION_LOG" 2>/dev/null; then
        hline "╠" "═" "╣"
        row "$(printf "%b  PER-CLASS F1 SCORES (Final Eval)%b" "$BOLD_MAGENTA" "$RST")"
        row_empty

        local in_report=0
        while IFS= read -r line; do
            if echo "$line" | grep -q "precision    recall"; then
                in_report=1
                continue
            fi
            if ((in_report)); then
                if echo "$line" | grep -qE "^\s+(angry|disgust|fear|happy|sad|surprise|neutral)"; then
                    local cls prec rec f1 sup
                    cls=$(echo "$line" | awk '{print $1}')
                    prec=$(echo "$line" | awk '{print $2}')
                    rec=$(echo "$line" | awk '{print $3}')
                    f1=$(echo "$line" | awk '{print $4}')
                    sup=$(echo "$line" | awk '{print $5}')
                    local f1_bar_len
                    f1_bar_len=$(awk "BEGIN {printf \"%d\", $f1 * 20}")
                    local f1_bar=""
                    for ((i = 0; i < f1_bar_len; i++)); do f1_bar+="█"; done
                    for ((i = f1_bar_len; i < 20; i++)); do f1_bar+="░"; done
                    row "$(printf "  %-10s %s %b%s%b  %s" "$cls" "$(color_acc "$f1")" "$GREEN" "$f1_bar" "$RST" "$DIM$sup$RST")"
                fi
                if echo "$line" | grep -q "^$" || echo "$line" | grep -q "accuracy"; then
                    in_report=0
                fi
            fi
        done < "$EMOTION_LOG"
    fi

    # Patience indicator
    if [[ "$E_EPOCH" != "0" && "$E_BEST_ACC" != "--" && "$E_VACC" != "--" ]]; then
        local patience_used=0
        # Count consecutive epochs without improvement from the end
        local all_accs=()
        while IFS= read -r line; do
            local v
            v=$(echo "$line" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
            all_accs+=("$v")
        done < <(grep -E "^Epoch [0-9]+/[0-9]+ \|" "$EMOTION_LOG" 2>/dev/null)

        for ((i=${#all_accs[@]}-1; i>=0; i--)); do
            local is_best
            is_best=$(awk "BEGIN {print (${all_accs[$i]} >= $E_BEST_ACC) ? 1 : 0}")
            if ((is_best)); then break; fi
            ((patience_used++))
        done

        if ((patience_used > 0)); then
            local patience_bar=""
            for ((i = 0; i < patience_used; i++)); do patience_bar+="●"; done
            for ((i = patience_used; i < 7; i++)); do patience_bar+="○"; done
            local patience_color="$BOLD_YELLOW"
            ((patience_used >= 5)) && patience_color="$BOLD_RED"
            row "$(printf "  Patience:  %b%s%b  %d/7 (early stop)" "$patience_color" "$patience_bar" "$RST" "$patience_used")"
        fi
    fi

    # Inference enhancements
    row_empty
    row "$(printf "  %bInference:%b  %b TTA %b (orig+flip avg)" "$DIM" "$RST" "$BG_GREEN" "$RST")"

    # Footer
    hline "╚" "═" "╝"
    printf "%b  Press Ctrl+C to exit  │  Refreshing every %ds%b\n" "$DIM" "$REFRESH" "$RST"
    printf "%b  Log: %s%b\n" "$DIM" "$EMOTION_LOG" "$RST"
}

# ── Main ─────────────────────────────────────────────────

printf "\033[?25l"  # hide cursor
trap 'printf "\033[?25h\n"; exit 0' INT TERM EXIT

# Wait for log file if training hasn't started yet
if [[ ! -f "$EMOTION_LOG" ]]; then
    printf "\033[H\033[J"
    printf "%b⏳ Waiting for training to start...%b\n" "$BOLD_YELLOW" "$RST"
    printf "%bExpecting log at: %s%b\n" "$DIM" "$EMOTION_LOG" "$RST"
    while [[ ! -f "$EMOTION_LOG" ]]; do
        sleep 1
    done
fi

while true; do
    render
    sleep "$REFRESH"
done
