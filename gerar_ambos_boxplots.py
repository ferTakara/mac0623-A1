import glob
import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

def load_data():
    files_a1 = glob.glob('Assignment-1/CSV/*.csv')
    files_a2 = glob.glob('Assignment-2/CSV/*.csv')
    
    dfs = []
    for f in sorted(files_a1 + files_a2):
        df = pd.read_csv(f)
        dfs.append(df)
        
    if not dfs:
        raise FileNotFoundError("Nenhum arquivo CSV encontrado em Assignment-1/CSV ou Assignment-2/CSV.")
        
    data = pd.concat(dfs, ignore_index=True)
    
    # Mapeamento com nomes legíveis
    mapping_names = {
        1: 'Desktop Baseline (M1)',
        2: 'Desktop Custom (M2)',
        3: 'VR Direct Grab (M3)',
        4: 'VR Trackball (M4)',
        5: 'VR Gizmo (M5)'
    }
    data['mapping_name'] = data['mapping'].map(mapping_names)
    data['mapping_label'] = data['mapping'].astype(str)
    data['modality'] = data['mapping'].apply(lambda m: 'Desktop (M1 + M2)' if m in [1, 2] else 'VR (M3 + M4 + M5)')
    
    return data

def print_summary_statistics(data):
    print("=" * 75)
    print("RESUMO ESTATÍSTICO COMPLETO POR MAPPING")
    print("=" * 75)
    
    metrics = ['completion_time_s', 'final_position_error', 'final_orientation_error_deg']
    summary = data.groupby(['mapping', 'mapping_name'])[metrics].agg(['count', 'mean', 'std', 'median']).round(3)
    print(summary)
    print("\n" + "=" * 75)
    
    print("RESUMO AGREGADO: TODOS OS DESKTOP VS. TODOS OS VR")
    print("=" * 75)
    summary_mod = data.groupby('modality')[metrics].agg(['count', 'mean', 'std', 'median']).round(3)
    print(summary_mod)
    print("\n" + "=" * 75)
    
    # Médias por participante
    means_p = data.groupby(['participant_id', 'mapping', 'mapping_name'])[metrics].mean().round(3).reset_index()
    print("MÉDIAS POR PARTICIPANTE E MAPPING:")
    print(means_p.to_string(index=False))
    print("=" * 75 + "\n")
    return means_p

def plot_desktop_vs_vr(data, means_p):
    """
    Comparação 1: Desktop Baseline vs. VR Direct Grab (DoF-Matching Nominal)
    Compara o Baseline do A1 (Mapping 1) contra o VR Direct Grab (Mapping 3).
    """
    df_comp1 = data[data['mapping'].isin([1, 3])].copy()
    palette = {"Desktop Baseline (M1)": "#4c72b0", "VR Direct Grab (M3)": "#dd8452"}
    
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    
    # Tempo
    sns.boxplot(data=df_comp1, x='mapping_name', y='completion_time_s', hue='mapping_name', ax=axes[0], palette=palette, legend=False)
    sns.stripplot(data=df_comp1, x='mapping_name', y='completion_time_s', ax=axes[0], color='black', alpha=0.5, jitter=0.2)
    axes[0].set_title('Tempo de Conclusão (s)', fontsize=13, fontweight='bold')
    axes[0].set_ylabel('Tempo (s)', fontsize=11)
    axes[0].set_xlabel('')
    
    # Erro de Posição
    sns.boxplot(data=df_comp1, x='mapping_name', y='final_position_error', hue='mapping_name', ax=axes[1], palette=palette, legend=False)
    sns.stripplot(data=df_comp1, x='mapping_name', y='final_position_error', ax=axes[1], color='black', alpha=0.5, jitter=0.2)
    axes[1].set_title('Erro de Posição Final', fontsize=13, fontweight='bold')
    axes[1].set_ylabel('Distância Euclidiana', fontsize=11)
    axes[1].set_xlabel('')
    
    # Erro de Orientação
    sns.boxplot(data=df_comp1, x='mapping_name', y='final_orientation_error_deg', hue='mapping_name', ax=axes[2], palette=palette, legend=False)
    sns.stripplot(data=df_comp1, x='mapping_name', y='final_orientation_error_deg', ax=axes[2], color='black', alpha=0.5, jitter=0.2)
    axes[2].set_title('Erro de Orientação (°)', fontsize=13, fontweight='bold')
    axes[2].set_ylabel('Graus (°)', fontsize=11)
    axes[2].set_xlabel('')
    
    fig.suptitle('Comparação 1: Desktop Baseline (M1) vs. VR Direct Grab (M3) — DoF Matching', fontsize=15, fontweight='bold', y=1.03)
    fig.tight_layout()
    output_path = 'comparacao_desktop_vs_vr.png'
    fig.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"[OK] Gráfico salvo: {output_path}")

def plot_all_desktop_vs_all_vr(data):
    """
    Comparação Agregada: Todos os Desktop Somados (M1 + M2) vs. Todos os VR Somados (M3 + M4 + M5)
    """
    palette = {'Desktop (M1 + M2)': '#4c72b0', 'VR (M3 + M4 + M5)': '#c44e52'}
    
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    
    # Tempo
    sns.boxplot(data=data, x='modality', y='completion_time_s', hue='modality', ax=axes[0], palette=palette, legend=False)
    sns.stripplot(data=data, x='modality', y='completion_time_s', ax=axes[0], color='black', alpha=0.4, jitter=0.2)
    axes[0].set_title('Tempo de Conclusão (s)', fontsize=13, fontweight='bold')
    axes[0].set_ylabel('Tempo (s)', fontsize=11)
    axes[0].set_xlabel('')
    
    # Erro de Posição
    sns.boxplot(data=data, x='modality', y='final_position_error', hue='modality', ax=axes[1], palette=palette, legend=False)
    sns.stripplot(data=data, x='modality', y='final_position_error', ax=axes[1], color='black', alpha=0.4, jitter=0.2)
    axes[1].set_title('Erro de Posição Final', fontsize=13, fontweight='bold')
    axes[1].set_ylabel('Distância Euclidiana', fontsize=11)
    axes[1].set_xlabel('')
    
    # Erro de Orientação
    sns.boxplot(data=data, x='modality', y='final_orientation_error_deg', hue='modality', ax=axes[2], palette=palette, legend=False)
    sns.stripplot(data=data, x='modality', y='final_orientation_error_deg', ax=axes[2], color='black', alpha=0.4, jitter=0.2)
    axes[2].set_title('Erro de Orientação (°)', fontsize=13, fontweight='bold')
    axes[2].set_ylabel('Graus (°)', fontsize=11)
    axes[2].set_xlabel('')
    
    fig.suptitle('Comparação Agregada: Todos os Testes Desktop vs. Todos os Testes VR', fontsize=15, fontweight='bold', y=1.03)
    fig.tight_layout()
    output_path = 'comparacao_todos_desktop_vs_todos_vr.png'
    fig.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"[OK] Gráfico salvo: {output_path}")

def plot_vr_internal(data, means_p):
    """
    Comparação 2: Intra-VR (Estilos de Manipulação Imersiva)
    Compara VR Direct Grab (M3), VR Trackball (M4) e VR Gizmo (M5).
    """
    df_vr = data[data['mapping'].isin([3, 4, 5])].copy()
    palette = {
        "VR Direct Grab (M3)": "#dd8452",
        "VR Trackball (M4)": "#55a868",
        "VR Gizmo (M5)": "#8172b3"
    }
    
    fig, axes = plt.subplots(1, 3, figsize=(17, 5))
    
    # Tempo
    sns.boxplot(data=df_vr, x='mapping_name', y='completion_time_s', hue='mapping_name', ax=axes[0], palette=palette, legend=False)
    sns.stripplot(data=df_vr, x='mapping_name', y='completion_time_s', ax=axes[0], color='black', alpha=0.5, jitter=0.2)
    axes[0].set_title('Tempo de Conclusão (s)', fontsize=13, fontweight='bold')
    axes[0].set_ylabel('Tempo (s)', fontsize=11)
    axes[0].set_xlabel('')
    axes[0].tick_params(axis='x', rotation=10)
    
    # Erro de Posição
    sns.boxplot(data=df_vr, x='mapping_name', y='final_position_error', hue='mapping_name', ax=axes[1], palette=palette, legend=False)
    sns.stripplot(data=df_vr, x='mapping_name', y='final_position_error', ax=axes[1], color='black', alpha=0.5, jitter=0.2)
    axes[1].set_title('Erro de Posição Final', fontsize=13, fontweight='bold')
    axes[1].set_ylabel('Distância Euclidiana', fontsize=11)
    axes[1].set_xlabel('')
    axes[1].tick_params(axis='x', rotation=10)
    
    # Erro de Orientação
    sns.boxplot(data=df_vr, x='mapping_name', y='final_orientation_error_deg', hue='mapping_name', ax=axes[2], palette=palette, legend=False)
    sns.stripplot(data=df_vr, x='mapping_name', y='final_orientation_error_deg', ax=axes[2], color='black', alpha=0.5, jitter=0.2)
    axes[2].set_title('Erro de Orientação (°)', fontsize=13, fontweight='bold')
    axes[2].set_ylabel('Graus (°)', fontsize=11)
    axes[2].set_xlabel('')
    axes[2].tick_params(axis='x', rotation=10)
    
    fig.suptitle('Comparação 2: Avaliação Intra-VR (Grab vs. Trackball vs. Gizmo)', fontsize=15, fontweight='bold', y=1.03)
    fig.tight_layout()
    output_path = 'comparacao_intra_vr.png'
    fig.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"[OK] Gráfico salvo: {output_path}")

def plot_overview_all(data, means_p):
    """
    Gráficos gerais contendo todos os 5 mapeamentos (dados brutos e médias por participante).
    """
    palette = "Set2"
    
    # 1. Dados brutos
    fig1, axes1 = plt.subplots(1, 3, figsize=(18, 5.5))
    sns.boxplot(data=data, x='mapping_label', y='completion_time_s', hue='mapping_label', ax=axes1[0], palette=palette, legend=False)
    axes1[0].set_title('Tempo de Conclusão (Todos os Dados)', fontsize=12, fontweight='bold')
    axes1[0].set_ylabel('Tempo (s)')
    axes1[0].set_xlabel('Mapping (1=DesktopBase, 2=DesktopCustom, 3=VRGrab, 4=VRTrack, 5=VRGizmo)')
    
    sns.boxplot(data=data, x='mapping_label', y='final_position_error', hue='mapping_label', ax=axes1[1], palette=palette, legend=False)
    axes1[1].set_title('Erro de Posição Final (Todos os Dados)', fontsize=12, fontweight='bold')
    axes1[1].set_ylabel('Erro de Posição')
    axes1[1].set_xlabel('Mapping')
    
    sns.boxplot(data=data, x='mapping_label', y='final_orientation_error_deg', hue='mapping_label', ax=axes1[2], palette=palette, legend=False)
    axes1[2].set_title('Erro de Orientação (Todos os Dados)', fontsize=12, fontweight='bold')
    axes1[2].set_ylabel('Erro de Orientação (°)')
    axes1[2].set_xlabel('Mapping')
    
    fig1.tight_layout()
    fig1.savefig('boxplots_geral.png', dpi=300)
    plt.close(fig1)
    print(f"[OK] Gráfico salvo: boxplots_geral.png")
    
    # 2. Médias por participante
    fig2, axes2 = plt.subplots(1, 3, figsize=(18, 5.5))
    sns.boxplot(data=means_p, x='mapping', y='completion_time_s', hue='mapping', ax=axes2[0], palette="Set3", legend=False)
    axes2[0].set_title('Média do Tempo de Conclusão por Participante', fontsize=12, fontweight='bold')
    axes2[0].set_ylabel('Tempo (s)')
    axes2[0].set_xlabel('Mapping')
    
    sns.boxplot(data=means_p, x='mapping', y='final_position_error', hue='mapping', ax=axes2[1], palette="Set3", legend=False)
    axes2[1].set_title('Média do Erro de Posição por Participante', fontsize=12, fontweight='bold')
    axes2[1].set_ylabel('Erro de Posição')
    axes2[1].set_xlabel('Mapping')
    
    sns.boxplot(data=means_p, x='mapping', y='final_orientation_error_deg', hue='mapping', ax=axes2[2], palette="Set3", legend=False)
    axes2[2].set_title('Média do Erro de Orientação por Participante', fontsize=12, fontweight='bold')
    axes2[2].set_ylabel('Erro de Orientação (°)')
    axes2[2].set_xlabel('Mapping')
    
    fig2.tight_layout()
    fig2.savefig('boxplots_medias.png', dpi=300)
    plt.close(fig2)
    print(f"[OK] Gráfico salvo: boxplots_medias.png")

def main():
    sns.set_theme(style="whitegrid")
    data = load_data()
    means_p = print_summary_statistics(data)
    
    # 1. Comparação Desktop Baseline (M1) vs VR Direct Grab (M3)
    plot_desktop_vs_vr(data, means_p)
    
    # 2. Comparação Agregada: Todos Desktop (M1+M2) vs Todos VR (M3+M4+M5)
    plot_all_desktop_vs_all_vr(data)
    
    # 3. Comparação Intra-VR (M3 vs M4 vs M5)
    plot_vr_internal(data, means_p)
    
    # 4. Visão geral de todos os 5 mappings
    plot_overview_all(data, means_p)
    
    print("\nTodos os gráficos foram gerados com sucesso!")

if __name__ == "__main__":
    main()
