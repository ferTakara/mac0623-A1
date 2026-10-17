import glob
import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

def load_data():
    """
    Carrega dinamicamente todos os arquivos CSV brutos da pasta Assignment-3/CSV/
    """
    csv_files = sorted(glob.glob('Assignment-3/CSV/*.csv'))
    if not csv_files:
        # Tenta buscar na pasta local caso o script seja executado de dentro de Assignment-3
        csv_files = sorted(glob.glob('CSV/*.csv'))
        
    if not csv_files:
        raise FileNotFoundError("Nenhum arquivo CSV encontrado em Assignment-3/CSV/ ou CSV/.")

    dfs = []
    for f in csv_files:
        df = pd.read_csv(f)
        dfs.append(df)

    data = pd.concat(dfs, ignore_index=True)
    
    # Compatibilidade caso a coluna se chame 'technique' ou 'mapping'
    col_tech = 'mapping' if 'mapping' in data.columns else 'technique'
    
    technique_names = {
        1: 'WIM (Baseline)',
        2: 'Teleport Alyx (Custom)'
    }
    data['technique_name'] = data[col_tech].map(technique_names)
    data['technique_id'] = data[col_tech]
    
    print(f"[OK] {len(csv_files)} arquivos CSV carregados com sucesso ({len(data)} ensaios no total).")
    return data

def print_summary_statistics(data):
    print("\n" + "=" * 75)
    print("RESUMO ESTATÍSTICO COMPLETO (DADOS REAIS DOS CSVs)")
    print("=" * 75)
    
    metrics = ['completion_time_s', 'final_distance']
    summary = data.groupby(['technique_id', 'technique_name'])[metrics].agg(['count', 'mean', 'std', 'median']).round(2)
    print(summary)
    
    print("\n" + "-" * 75)
    print("MÉDIAS POR PARTICIPANTE:")
    print("-" * 75)
    p_means = data.groupby(['participant_id', 'technique_name'])[metrics].mean().round(2).reset_index()
    print(p_means.to_string(index=False))
    print("=" * 75 + "\n")

def plot_boxplots(data, output_path='Assignment-3/boxplot_tempo_distancia.png'):
    # Ajusta o caminho de saída caso executado dentro de Assignment-3
    if not os.path.exists('Assignment-3') and os.path.exists('CSV'):
        output_path = 'boxplot_tempo_distancia.png'

    plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
    plt.rcParams['font.family'] = 'sans-serif'
    sns.set_theme(style='whitegrid', palette='muted')

    fig, axes = plt.subplots(1, 2, figsize=(11, 5))
    palette = {'WIM (Baseline)': '#3274A1', 'Teleport Alyx (Custom)': '#E1812C'}

    # 1. Boxplot: Tempo de Conclusão (s)
    sns.boxplot(
        data=data, 
        x='technique_name', 
        y='completion_time_s', 
        ax=axes[0], 
        palette=palette, 
        width=0.45, 
        hue='technique_name', 
        legend=False
    )
    sns.stripplot(
        data=data, 
        x='technique_name', 
        y='completion_time_s', 
        ax=axes[0], 
        color='black', 
        alpha=0.6, 
        jitter=0.15, 
        size=7
    )
    axes[0].set_title('Tempo de Conclusão (s)', fontsize=13, fontweight='bold', pad=10)
    axes[0].set_ylabel('Tempo (segundos)', fontsize=11)
    axes[0].set_xlabel('')

    # 2. Boxplot: Distância Final ao Alvo (m)
    sns.boxplot(
        data=data, 
        x='technique_name', 
        y='final_distance', 
        ax=axes[1], 
        palette=palette, 
        width=0.45, 
        hue='technique_name', 
        legend=False
    )
    sns.stripplot(
        data=data, 
        x='technique_name', 
        y='final_distance', 
        ax=axes[1], 
        color='black', 
        alpha=0.6, 
        jitter=0.15, 
        size=7
    )
    axes[1].axhline(1.0, color='red', linestyle='--', alpha=0.8, label='Tolerância Máx (1.0m)')
    axes[1].set_title('Distância Final ao Alvo (m)', fontsize=13, fontweight='bold', pad=10)
    axes[1].set_ylabel('Distância ao Centro do Alvo (m)', fontsize=11)
    axes[1].set_xlabel('')
    axes[1].legend(loc='upper right')

    fig.suptitle('Comparação Empírica: WIM vs. Teleporte Alyx', fontsize=14, fontweight='bold', y=1.02)
    fig.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"[OK] Gráfico salvo com sucesso em: {output_path}")

if __name__ == '__main__':
    df = load_data()
    print_summary_statistics(df)
    plot_boxplots(df)
