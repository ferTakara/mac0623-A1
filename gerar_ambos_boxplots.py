import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import glob
import os

def main():
    files = glob.glob('*1.csv') + glob.glob('*2.csv')

    dfs = []
    for file in files:
        df = pd.read_csv(file)
        dfs.append(df)

    data = pd.concat(dfs, ignore_index=True)
    
    print("Todos os dados lidos dos CSVs:")
    print(data.to_string())
    print("\n--------------------------------------------------\n")

    # Calcula a média do tempo e dos erros por participante e por mapping
    means = data.groupby(['participant_id', 'mapping'])[['completion_time_s', 'final_position_error', 'final_orientation_error_deg']].mean().reset_index()

    print("Médias calculadas por participante e mapping:")
    print(means)
    print("\n--------------------------------------------------\n")

    sns.set_theme(style="whitegrid")


    # 1. Boxplots com os dados brutos
    fig1, axes1 = plt.subplots(1, 3, figsize=(18, 6))

    sns.boxplot(data=data, x='mapping', y='completion_time_s', ax=axes1[0], palette="Set2")
    axes1[0].set_title('Tempo de Conclusão (Todos os dados)')
    axes1[0].set_ylabel('Tempo (s)')
    axes1[0].set_xlabel('Mapping')

    sns.boxplot(data=data, x='mapping', y='final_position_error', ax=axes1[1], palette="Set2")
    axes1[1].set_title('Erro de Posição Final (Todos os dados)')
    axes1[1].set_ylabel('Erro de Posição')
    axes1[1].set_xlabel('Mapping')

    sns.boxplot(data=data, x='mapping', y='final_orientation_error_deg', ax=axes1[2], palette="Set2")
    axes1[2].set_title('Erro de Orientação (Todos os dados)')
    axes1[2].set_ylabel('Erro de Orientação (°)')
    axes1[2].set_xlabel('Mapping')

    fig1.tight_layout()
    output_img1 = 'boxplots_geral.png'
    fig1.savefig(output_img1)
    print(f"Boxplots (dados brutos) salvos em: {output_img1}")


    # 2. Boxplots com as médias
    fig2, axes2 = plt.subplots(1, 3, figsize=(18, 6))

    sns.boxplot(data=means, x='mapping', y='completion_time_s', ax=axes2[0], palette="Set3")
    axes2[0].set_title('Média do Tempo de Conclusão (s)')
    axes2[0].set_ylabel('Tempo (s)')
    axes2[0].set_xlabel('Mapping')

    sns.boxplot(data=means, x='mapping', y='final_position_error', ax=axes2[1], palette="Set3")
    axes2[1].set_title('Média do Erro de Posição Final')
    axes2[1].set_ylabel('Erro de Posição')
    axes2[1].set_xlabel('Mapping')

    sns.boxplot(data=means, x='mapping', y='final_orientation_error_deg', ax=axes2[2], palette="Set3")
    axes2[2].set_title('Média do Erro de Orientação (graus)')
    axes2[2].set_ylabel('Erro de Orientação (°)')
    axes2[2].set_xlabel('Mapping')

    fig2.tight_layout()
    output_img2 = 'boxplots_medias.png'
    fig2.savefig(output_img2)
    print(f"Boxplots (médias) salvos em: {output_img2}")
    
    # Mostra ambos os plots
    plt.show()

if __name__ == "__main__":
    main()
