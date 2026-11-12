import glob
import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

def load_data():
    csv_files = sorted(glob.glob("Assignment-4/CSV/*.csv"))
    if not csv_files:
        csv_files = sorted(glob.glob("CSV/*.csv"))
        
    if not csv_files:
        raise FileNotFoundError("Nenhum arquivo CSV encontrado em Assignment-4/CSV/ ou CSV/.")

    dfs = [pd.read_csv(f) for f in csv_files]
    data = pd.concat(dfs, ignore_index=True)
    
    technique_names = {
        "touch": "T1: Touch (Baseline)",
        "technique2": "T2: Raycast+Volante (Custom)"
    }
    data["technique_name"] = data["technique"].map(technique_names)
    print(f"[OK] {len(csv_files)} arquivos CSV carregados ({len(data)} ensaios).")
    return data

def print_summary_statistics(data):
    print("\n" + "=" * 80)
    print("RESUMO ESTATÍSTICO COMPLETO — ASSIGNMENT 4 (MOBILE AR DOCKING)")
    print("=" * 80)
    metrics = ["completion_time_s", "pos_error_cm", "yaw_error_deg", "touch_count"]
    summary = data.groupby(["technique", "technique_name"])[metrics].agg(["count", "mean", "std", "median"]).round(2)
    print(summary)
    print("\n" + "-" * 80)
    print("MÉDIAS POR PARTICIPANTE E TÉCNICA:")
    print("-" * 80)
    p_means = data.groupby(["participant_id", "technique_name"])[metrics].mean().round(2).reset_index()
    print(p_means.to_string(index=False))
    print("=" * 80 + "\n")

def plot_boxplots(data, output_path="Assignment-4/boxplot_a4.png"):
    if not os.path.exists("Assignment-4") and os.path.exists("CSV"):
        output_path = "boxplot_a4.png"

    plt.rcParams["font.sans-serif"] = "DejaVu Sans"
    plt.rcParams["font.family"] = "sans-serif"
    sns.set_theme(style="whitegrid", palette="muted")

    fig, axes = plt.subplots(1, 4, figsize=(16, 4.2))
    palette = {"T1: Touch (Baseline)": "#2b5c8f", "T2: Raycast+Volante (Custom)": "#d95f02"}

    # 1. Tempo de Conclusao
    sns.boxplot(data=data, x="technique_name", y="completion_time_s", ax=axes[0], palette=palette, width=0.45, hue="technique_name", legend=False)
    sns.stripplot(data=data, x="technique_name", y="completion_time_s", ax=axes[0], color="black", alpha=0.7, jitter=0.12, size=7)
    axes[0].set_title("Tempo de Conclusão (s)", fontsize=11, fontweight="bold", pad=8)
    axes[0].set_ylabel("Tempo (s)", fontsize=10)
    axes[0].set_xlabel("")

    # 2. Erro de Posicao
    sns.boxplot(data=data, x="technique_name", y="pos_error_cm", ax=axes[1], palette=palette, width=0.45, hue="technique_name", legend=False)
    sns.stripplot(data=data, x="technique_name", y="pos_error_cm", ax=axes[1], color="black", alpha=0.7, jitter=0.12, size=7)
    axes[1].axhline(2.0, color="#e63946", linestyle="--", linewidth=1.5, label="Tolerância (2.0 cm)")
    axes[1].set_title("Erro Posição Final (cm)", fontsize=11, fontweight="bold", pad=8)
    axes[1].set_ylabel("Erro (cm)", fontsize=10)
    axes[1].set_xlabel("")
    axes[1].legend(loc="upper right", fontsize=8)

    # 3. Erro de Yaw
    sns.boxplot(data=data, x="technique_name", y="yaw_error_deg", ax=axes[2], palette=palette, width=0.45, hue="technique_name", legend=False)
    sns.stripplot(data=data, x="technique_name", y="yaw_error_deg", ax=axes[2], color="black", alpha=0.7, jitter=0.12, size=7)
    axes[2].axhline(10.0, color="#e63946", linestyle="--", linewidth=1.5, label="Tolerância (10.0°)")
    axes[2].set_title("Erro Yaw Final (graus)", fontsize=11, fontweight="bold", pad=8)
    axes[2].set_ylabel("Erro (graus °)", fontsize=10)
    axes[2].set_xlabel("")
    axes[2].legend(loc="upper right", fontsize=8)

    # 4. Touch Count
    sns.boxplot(data=data, x="technique_name", y="touch_count", ax=axes[3], palette=palette, width=0.45, hue="technique_name", legend=False)
    sns.stripplot(data=data, x="technique_name", y="touch_count", ax=axes[3], color="black", alpha=0.7, jitter=0.12, size=7)
    axes[3].set_title("Toques na Tela", fontsize=11, fontweight="bold", pad=8)
    axes[3].set_ylabel("Contagem", fontsize=10)
    axes[3].set_xlabel("")

    for ax in axes:
        ax.tick_params(axis="x", rotation=10, labelsize=9)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    print(f"[OK] Gráficos salvos em: {output_path}")

if __name__ == "__main__":
    df = load_data()
    print_summary_statistics(df)
    plot_boxplots(df)
