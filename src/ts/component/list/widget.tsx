import * as React from 'react';
import raf from 'raf';
import { observer } from 'mobx-react';
import { Button, Widget } from 'Component';
import { C, I, M, keyboard, ObjectUtil } from 'Lib';
import { blockStore, menuStore } from 'Store';
import arrayMove from 'array-move';
import Constant from 'json/constant.json';

interface Props {
	dataset?: any;
};

type State = {
	isEditing: boolean;
	previewId: string;
};

const WIDGET_COUNT_LIMIT = 10;

const ListWidget = observer(class ListWidget extends React.Component<Props, State> {
		
	state: State = {
		isEditing: false,
		previewId: '',
	};

	node: any = null;
	top = 0;
	dropTargetId = '';
	position: I.BlockPosition = null;
	isDragging = false;
	frame = 0;

	constructor (props: Props) {
		super(props);

		this.toggleEditMode = this.toggleEditMode.bind(this);
		this.addWidget = this.addWidget.bind(this);
		this.onDragStart = this.onDragStart.bind(this);
		this.onDragOver = this.onDragOver.bind(this);
		this.onDrop = this.onDrop.bind(this);
		this.onScroll = this.onScroll.bind(this);
		this.setPreview = this.setPreview.bind(this);
		this.setEditing = this.setEditing.bind(this);
	};

	render(): React.ReactNode {
		const { isEditing, previewId } = this.state;
		const { widgets } = blockStore;
		const cn = [ 'listWidget' ];

		let content = null;

		if (previewId) {
			const block = blockStore.getLeaf(widgets, previewId);

			if (block) {
				cn.push('isListPreview');
				content = (
					<Widget 
						{...this.props}
						key={`widget-${block.id}`}
						block={block}
						isPreview={true}
						setPreview={this.setPreview}
						setEditing={this.setEditing}
					/>
				);
			};
		} else {
			const buttons: I.ButtonComponent[] = [];
			const blocks = blockStore.getChildren(widgets, widgets);

			if (isEditing) {
				cn.push('isEditing');
			};

			if (isEditing) {
				if (blocks.length <= WIDGET_COUNT_LIMIT) {
					buttons.push({ id: 'widget-list-add', text: 'Add', onClick: this.addWidget });
				};

				buttons.push({ id: 'widget-list-done', text: 'Done', onClick: this.toggleEditMode });
			} else {
				buttons.push({ id: 'widget-list-edit', className: 'edit c28', text: 'Edit widgets', onClick: this.toggleEditMode });
			};

			content = (
				<React.Fragment>
					<Widget 
						block={new M.Block({ type: I.BlockType.Widget, content: { layout: I.WidgetLayout.Space } })} 
						disableContextMenu={true} 
						onDragStart={this.onDragStart}
						onDragOver={this.onDragOver}
					/>

					{blocks.map((block, i) => (
						<Widget 
							{...this.props}
							key={`widget-${block.id}`}
							block={block}
							isDraggable={isEditing}
							onDragStart={this.onDragStart}
							onDragOver={this.onDragOver}
							setPreview={this.setPreview}
							setEditing={this.setEditing}
						/>
					))}

					<Button 
						text="Library" 
						color="" 
						className="widget" 
						icon="library" 
						onClick={e => ObjectUtil.openEvent(e, { layout: I.ObjectLayout.Store })} 
					/>

					<Button 
						text="Bin" 
						color="" 
						className="widget" 
						icon="bin" 
						onClick={e => ObjectUtil.openEvent(e, { layout: I.ObjectLayout.Archive })} 
					/>

					<div className="buttons">
						{buttons.map(button => (
							<Button key={button.id} color="" {...button} />
						))}
					</div>
				</React.Fragment>
			);
		};

		return (
			<div 
				ref={node => this.node = node}
				id="listWidget"
				className={cn.join(' ')}
				onDrop={this.onDrop}
				onScroll={this.onScroll}
			>
				{content}
			</div>
		);
	};

	componentDidUpdate (): void {
		$(this.node).scrollTop(this.top);
	};

	toggleEditMode (): void {
		this.setState({ isEditing: !this.state.isEditing });
	};

	addWidget (): void {
		menuStore.open('widget', {
			element: '#widget-list-add',
			className: 'fixed',
			classNameWrap: 'fromSidebar',
			offsetY: -2,
			subIds: Constant.menuIds.widget,
			vertical: I.MenuDirection.Top,
			data: {
				setEditing: this.setEditing,
			}
		});
	};

	onDragStart (e: React.DragEvent, blockId: string): void {
		e.stopPropagation();

		const { dataset } = this.props;
		const { selection, preventCommonDrop } = dataset;
		const win = $(window);
		const node = $(this.node);
		const obj = node.find(`#widget-${blockId}`);
		const clone = $('<div />').addClass('widget isClone').css({ 
			zIndex: 10000, 
			position: 'fixed', 
			left: -10000, 
			top: -10000,
			width: obj.outerWidth(),
		});

		clone.append(obj.find('.head').clone());
		node.append(clone);

		preventCommonDrop(true);
		selection.clear();
		keyboard.disableSelection(true);
		keyboard.setDragging(true);
		this.isDragging = true;

		e.dataTransfer.setDragImage(clone.get(0), 0, 0);
		e.dataTransfer.setData('text', blockId);

		win.off('dragend.widget').on('dragend.widget', () => {
			this.clear();
			win.off('dragend.widget');
		});
	};

	onDragOver (e: React.DragEvent, blockId: string) {
		if (!this.isDragging) {
			return;
		};

		e.preventDefault();

		const target = $(e.currentTarget);
		if (!target.hasClass('isDraggable')) {
			return;
		};

		const y = e.pageY - $(window).scrollTop();

		raf.cancel(this.frame);
		this.frame = raf(() => {
			this.clear();
			this.dropTargetId = blockId;
			this.position = this.getPosition(y, target.get(0));

			target.addClass([ 'isOver', (this.position == I.BlockPosition.Top ? 'top' : 'bottom') ].join(' '));
		});
	};

	onDrop (e: React.DragEvent): void {
		const { isEditing } = this.state;

		if (!isEditing) {
			return;
		};

		e.stopPropagation();

		const { dataset } = this.props;
		const { selection, preventCommonDrop } = dataset;
		const { widgets } = blockStore;
		const blockId = e.dataTransfer.getData('text');

		if (blockId != this.dropTargetId) {
			const childrenIds = blockStore.getChildrenIds(widgets, widgets);
			const oldIndex = childrenIds.indexOf(blockId);
			const newIndex = childrenIds.indexOf(this.dropTargetId);

			blockStore.updateStructure(widgets, widgets, arrayMove(childrenIds, oldIndex, newIndex));
			C.BlockListMoveToExistingObject(widgets, widgets, this.dropTargetId, [ blockId ], this.position);
		};

		preventCommonDrop(false);
		keyboard.disableSelection(false);
		keyboard.setDragging(false);
		this.isDragging = false;
		this.clear();
	};

	onScroll () {
		this.top = $(this.node).scrollTop();
	};

	clear () {
		const node = $(this.node);

		node.find('.widget.isOver').removeClass('isOver top bottom');
		node.find('.widget.isClone').remove();

		this.dropTargetId = '';
		this.position = null;

		raf.cancel(this.frame);
	};

	getPosition (y: number, target): I.BlockPosition {
		const { top, height } = target.getBoundingClientRect();

		return y <= top + height / 2 ? I.BlockPosition.Top : I.BlockPosition.Bottom;
	};

	setPreview (previewId: string) {
		this.setState({ previewId });
	};

	setEditing (isEditing: boolean) {
		this.setState({ isEditing });
	};

});

export default ListWidget;